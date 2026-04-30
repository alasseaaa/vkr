"""PDF-отчёт пациента в формате официальной аналитической справки."""

from __future__ import annotations

import os
import platform
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from genapp.models import DoctorComment, DoctorPatient
from genapp.recommendations.services import get_user_recommendations

_FONT_REGISTERED = False
_FONT_NAME = "PatientReportTimes"


def _resolve_unicode_font_path() -> str | None:
    configured = getattr(settings, "PATIENT_REPORT_FONT_PATH", None) or os.environ.get(
        "PATIENT_REPORT_FONT_PATH", ""
    ).strip()
    if configured and Path(configured).is_file():
        return configured

    candidates: list[Path] = []
    system = platform.system()
    if system == "Windows":
        windir = os.environ.get("WINDIR", "C:\\Windows")
        candidates.extend(
            [
                Path(windir) / "Fonts" / "times.ttf",
                Path(windir) / "Fonts" / "timesnewroman.ttf",
                Path(windir) / "Fonts" / "arial.ttf",
                Path(windir) / "Fonts" / "arialuni.ttf",
                Path(windir) / "Fonts" / "segoeui.ttf",
            ]
        )
    elif system == "Darwin":
        candidates.extend(
            [
                Path("/Library/Fonts/Times New Roman.ttf"),
                Path("/System/Library/Fonts/Supplemental/Times New Roman.ttf"),
                Path("/Library/Fonts/Arial.ttf"),
                Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
                Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
            ]
        )
    else:
        candidates.extend(
            [
                Path("/usr/share/fonts/truetype/msttcorefonts/Times_New_Roman.ttf"),
                Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"),
                Path("/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
                Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
                Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
                Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
            ]
        )

    for p in candidates:
        if p.is_file():
            return str(p)
    return None


def _ensure_font() -> str:
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return _FONT_NAME
    path = _resolve_unicode_font_path()
    if not path:
        raise RuntimeError(
            "Не найден TTF-шрифт с поддержкой кириллицы. "
            "Укажите settings.PATIENT_REPORT_FONT_PATH или установите Arial/DejaVu в системе."
        )
    pdfmetrics.registerFont(TTFont(_FONT_NAME, path))
    _FONT_REGISTERED = True
    return _FONT_NAME


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    t = escape(str(text or "")).replace("\n", "<br/>")
    return Paragraph(t, style)


def _user_display_name(u) -> str:
    return f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username


def _treating_doctor_name(user):
    """Один лечащий врач по привязке DoctorPatient; иначе — из последнего комментария."""
    dp = (
        DoctorPatient.objects.filter(patient=user)
        .select_related("doctor")
        .order_by("created_at")
        .first()
    )
    if dp and dp.doctor_id:
        return _user_display_name(dp.doctor)
    c = (
        DoctorComment.objects.filter(patient=user, status="published")
        .select_related("doctor")
        .order_by("-created_at")
        .first()
    )
    if c:
        return _user_display_name(c.doctor)
    return None


def _short_name(full_name: str | None) -> str:
    src = str(full_name or "").strip()
    if not src:
        return "________________"
    parts = [p for p in src.split() if p]
    if len(parts) == 1:
        return parts[0]
    last = parts[0]
    initials = "".join(f"{p[0].upper()}." for p in parts[1:] if p)
    return f"{last} {initials}".strip()


def _format_gender(value: str | None) -> str:
    v = (value or "").strip().lower()
    if v == "male":
        return "Мужской"
    if v == "female":
        return "Женский"
    return "Не указано"


def _format_birth_and_age(birth_date, now_dt) -> str:
    if not birth_date:
        return "Не указано"
    years = now_dt.date().year - birth_date.year
    before_birthday = (now_dt.date().month, now_dt.date().day) < (birth_date.month, birth_date.day)
    if before_birthday:
        years -= 1
    return f"{birth_date.strftime('%d.%m.%Y')} ({max(years, 0)} лет)"


class _NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, footer_date: str, title: str, author: str, subject: str, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []
        self._footer_date = footer_date
        self.setTitle(title)
        self.setAuthor(author)
        self.setSubject(subject)

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_footer(page_count)
            super().showPage()
        super().save()

    def _draw_page_footer(self, page_count: int):
        self.saveState()
        self.setFont(_FONT_NAME, 8)
        self.setFillColor(colors.HexColor("#5f6b7a"))
        width, _ = A4
        self.drawString(2 * cm, 1.25 * cm, f"Страница {self._pageNumber} из {page_count}")
        self.drawRightString(width - 2 * cm, 1.25 * cm, f"Дата формирования: {self._footer_date}")
        self.restoreState()


def build_patient_report_pdf(user) -> bytes:
    font = _ensure_font()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="RepTitle",
        parent=styles["Heading2"],
        fontName=font,
        fontSize=12,
        leading=14,
        spaceAfter=8,
        textColor=colors.HexColor("#000000"),
    )
    h2_style = ParagraphStyle(
        name="RepH2",
        parent=styles["Heading2"],
        fontName=font,
        fontSize=12,
        leading=14,
        spaceBefore=12,
        spaceAfter=6,
        textColor=colors.HexColor("#000000"),
    )
    h3_style = ParagraphStyle(
        name="RepH3",
        parent=h2_style,
        fontSize=11,
        leading=13,
        spaceBefore=8,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        name="RepBody",
        parent=styles["Normal"],
        fontName=font,
        fontSize=10,
        leading=13,
        spaceAfter=6,
        leftIndent=0.2 * cm,
    )
    small_style = ParagraphStyle(
        name="RepSmall",
        parent=body_style,
        fontSize=8,
        leading=10,
        leftIndent=0,
        textColor=colors.HexColor("#666666"),
    )
    rec_category_style = ParagraphStyle(
        name="RecCategory",
        parent=body_style,
        fontName=font,
        fontSize=10,
        leading=13,
        spaceBefore=6,
        spaceAfter=6,
    )
    rec_title_style = ParagraphStyle(
        name="RecTitle",
        parent=body_style,
        fontName=font,
        fontSize=10,
        leading=13,
        leftIndent=0.3 * cm,
        spaceAfter=2,
    )
    rec_desc_style = ParagraphStyle(
        name="RecDesc",
        parent=body_style,
        fontName=font,
        fontSize=10,
        leading=13,
        leftIndent=0.8 * cm,
        spaceAfter=2,
    )
    rec_markers_style = ParagraphStyle(
        name="RecMarkers",
        parent=small_style,
        fontName=font,
        fontSize=8,
        leading=10,
        leftIndent=0.8 * cm,
        textColor=colors.HexColor("#666666"),
        spaceAfter=3,
    )
    org_title_style = ParagraphStyle(
        name="OrgTitleLeft",
        parent=title_style,
        alignment=TA_LEFT,
        leftIndent=0,
    )
    org_body_style = ParagraphStyle(
        name="OrgBodyLeft",
        parent=body_style,
        alignment=TA_LEFT,
        leftIndent=0,
    )

    story: list = []
    now = timezone.localtime(timezone.now())
    doc_number = f"ГП-{user.id}/{now.year}-{now.month:02d}"
    doc_title = "Аналитическая справка по результатам генетического исследования"
    patient_name = f"{user.last_name or ''} {user.first_name or ''} {getattr(user, 'middle_name', '') or ''}".strip()
    if not patient_name:
        patient_name = _user_display_name(user)

    profile = getattr(user, "userprofile", None)
    birth_and_age = _format_birth_and_age(getattr(profile, "birth_date", None), now)
    gender = _format_gender(getattr(profile, "gender", None))

    story.append(
        _p(
            "Федеральное государственное бюджетное научное учреждение "
            "«Научно-исследовательский институт ревматологии имени В.А. Насоновой» "
            "(ФГБНУ НИИР им. В.А. Насоновой)",
            org_title_style,
        )
    )
    story.append(_p("Лаборатория генетики / Центр персонализированной медицины", org_body_style))
    story.append(Spacer(1, 0.25 * cm))

    comments = list(
        DoctorComment.objects.filter(patient=user, status="published")
        .select_related("genotype__gene_variant__gene", "vitamin_test__vitamin")
        .order_by("id")
    )

    general = [c for c in comments if not c.genotype_id and not c.vitamin_test_id]
    by_vitamin = [c for c in comments if c.vitamin_test_id]
    by_genotype = [c for c in comments if c.genotype_id]

    story.append(_p("1. Основание и цель", h2_style))
    story.append(
        _p(
            "Настоящий отчёт подготовлен на основании результатов генетического тестирования, "
            "клинических данных и обращений пациента. Цель документа — систематизация "
            "генетических маркеров и формирование персональных рекомендаций для врача и пациента.",
            body_style,
        )
    )

    story.append(_p("2. Данные пациента", h2_style))
    patient_table = Table(
        [
            ["ФИО пациента", patient_name],
            ["Дата рождения (возраст)", birth_and_age],
            ["Пол", gender],
        ],
        colWidths=[5.2 * cm, 10.8 * cm],
    )
    patient_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("LEADING", (0, 0), (-1, -1), 13),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#cccccc")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cccccc")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(patient_table)

    story.append(_p("3. Результаты врачебной оценки", h2_style))
    story.append(_p("3.1 Общие рекомендации врача", h3_style))
    if not general:
        story.append(_p("Общие рекомендации врача не добавлены.", body_style))
    else:
        for c in general:
            txt = (c.text or "").strip()
            if txt:
                story.append(_p(txt, body_style))

    story.append(_p("3.2 Комментарии по генетическим маркерам", h3_style))
    if not by_genotype:
        story.append(_p("Комментарии по генетическим маркерам отсутствуют.", body_style))
    else:
        for c in by_genotype:
            gv = getattr(c, "genotype", None)
            sym = getattr(getattr(getattr(gv, "gene_variant", None), "gene", None), "symbol", None) or "маркер"
            story.append(_p(f"Маркер: {sym}", small_style))
            story.append(_p((c.text or "—").strip(), body_style))

    story.append(_p("3.3 Комментарии по анализам витаминов", h3_style))
    if not by_vitamin:
        story.append(_p("Комментарии по анализам витаминов отсутствуют.", body_style))
    else:
        for c in by_vitamin:
            vt = getattr(c, "vitamin_test", None)
            vn = getattr(getattr(vt, "vitamin", None), "name", None) or "анализ"
            story.append(_p(f"Анализ: {vn}", small_style))
            story.append(_p((c.text or "—").strip(), body_style))

    story.append(_p("4. Автоматизированные рекомендации системы", h2_style))
    rec_data = get_user_recommendations(user)
    categories = rec_data.get("categories") or {}
    if not categories:
        story.append(_p("По текущим генотипам персональных рекомендаций в базе нет.", body_style))
    else:
        for cat_key, cat in categories.items():
            label = cat.get("label") or cat_key
            story.append(Paragraph(f"<b>{escape(label)}</b>", rec_category_style))
            grouped_recs = {}
            for rec in cat.get("recommendations") or []:
                genes = rec.get("genes") or []
                group_key = tuple(sorted(str(g).strip() for g in genes if str(g).strip()))
                grouped_recs.setdefault(group_key, []).append(rec)

            for group_key, group_items in grouped_recs.items():
                group_markers = ", ".join(group_key)
                for rec in group_items:
                    title = rec.get("title") or "—"
                    desc = (rec.get("description") or "").strip()
                    story.append(Paragraph(f"<b>{escape(title)}</b>", rec_title_style))
                    if desc:
                        story.append(_p(desc, rec_desc_style))
                    story.append(Spacer(1, 0.08 * cm))

                if group_markers:
                    story.append(_p(f"Генотип: {group_markers}", rec_markers_style))
                story.append(Spacer(1, 0.12 * cm))
            story.append(Spacer(1, 0.4 * cm))

    story.append(_p("5. Заключение", h2_style))
    doc_name = _treating_doctor_name(user)
    doctor_name = doc_name or "Не назначен"
    doctor_short = _short_name(doc_name)
    conclusion_table = Table(
        [
            [
                Paragraph(
                    escape(
                        "Пациенту рекомендовано продолжить наблюдение у лечащего врача, "
                        "согласовать персональный план коррекции факторов риска и динамический контроль показателей."
                    ),
                    body_style,
                )
            ],
            [Paragraph(f"Лечащий врач: {escape(doctor_name)}", body_style)],
            [Paragraph("Специальность: врач-генетик", body_style)],
            [Paragraph(f"Подпись:    /{escape(doctor_short)}/    Дата: {now.strftime('%d.%m.%Y')}", body_style)],
        ],
        colWidths=[16 * cm],
    )
    conclusion_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cccccc")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(conclusion_table)

    buf = BytesIO()

    def _draw_page_header(canv, doc):
        canv.saveState()
        width, height = A4
        canv.setStrokeColor(colors.HexColor("#d4dce6"))
        canv.setLineWidth(0.6)
        canv.line(doc.leftMargin, height - 2.35 * cm, width - doc.rightMargin, height - 2.35 * cm)
        canv.setFont(font, 8)
        canv.setFillColor(colors.HexColor("#5f6b7a"))
        canv.drawString(doc.leftMargin, height - 1.55 * cm, "ФГБНУ НИИР им. В.А. Насоновой")
        canv.drawRightString(
            width - doc.rightMargin,
            height - 1.55 * cm,
            f"Аналитическая справка № {doc_number}",
        )
        canv.setFont(font, 7)
        canv.setFillColor(colors.HexColor("#6e7782"))
        canv.drawString(
            doc.leftMargin,
            2.2 * cm,
            "Внимание! Документ не является медицинским диагнозом или назначением. "
            "Окончательное решение о лечении принимает лечащий врач.",
        )
        canv.drawString(
            doc.leftMargin,
            1.9 * cm,
            "Автоматические рекомендации носят информационный характер и требуют клинической проверки.",
        )
        canv.restoreState()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.9 * cm,
        bottomMargin=2.7 * cm,
        title=f"{doc_title} № {doc_number}",
        author="ФГБНУ НИИР им. В.А. Насоновой",
    )
    doc.build(
        story,
        onFirstPage=_draw_page_header,
        onLaterPages=_draw_page_header,
        canvasmaker=lambda *args, **kwargs: _NumberedCanvas(
            *args,
            footer_date=now.strftime("%d.%m.%Y"),
            title=f"{doc_title} № {doc_number}",
            author="ФГБНУ НИИР им. В.А. Насоновой",
            subject=f"Медицинский отчёт пациента {patient_name}",
            **kwargs,
        ),
    )
    return buf.getvalue()
