"""
Выгрузка содержимого БД приложения genapp в текстовый/Markdown или JSON.

Примеры:
  python manage.py export_database
  python manage.py export_database --format json -o data/snapshot.json
  python manage.py export_database --anonymize

Загрузка обратно (тот же JSON):
  python manage.py import_database data/snapshot.json
  python manage.py import_database data/snapshot.json --with-user-data
"""

import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.conf import settings
from django.utils import timezone

from genapp.models import (
    Article,
    DoctorComment,
    DoctorCommentHistory,
    DoctorPatient,
    Gene,
    GeneVariant,
    GeneVariantRecommendation,
    GeneVitamin,
    InPersonAppointment,
    MythTruthQuestion,
    PatientNotification,
    Recommendation,
    UserGenotype,
    UserProfile,
    UserRecommendation,
    Vitamin,
    VitaminGenotypeEffect,
    VitaminTestResult,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Выгрузка данных genapp в .md (по умолчанию) или .json в файл."

    def add_arguments(self, parser):
        parser.add_argument(
            "-o",
            "--output",
            type=str,
            default=None,
            help="Путь к файлу. По умолчанию: <BASE_DIR>/exports/db_export_<дата>_<время>.md",
        )
        parser.add_argument(
            "--format",
            type=str,
            choices=["md", "json"],
            default="md",
            help="Формат: md (читаемый отчёт) или json (структура для бэкапа/обработки).",
        )
        parser.add_argument(
            "--anonymize",
            action="store_true",
            help="Скрыть логины и e-mail в пользовательских сущностях (для публикации выгрузки).",
        )

    def handle(self, *args, **options):
        out_path = options["output"]
        fmt = options["format"]
        anonymize = options["anonymize"]

        ts = timezone.now().strftime("%Y%m%d_%H%M%S")
        base = Path(getattr(settings, "BASE_DIR", Path.cwd()))
        exports_dir = base / "exports"
        exports_dir.mkdir(exist_ok=True)
        if not out_path:
            ext = "md" if fmt == "md" else "json"
            out_path = str(exports_dir / f"db_export_{ts}.{ext}")
        out_path = Path(out_path)
        if not out_path.is_absolute():
            out_path = base / out_path
        out_path.parent.mkdir(parents=True, exist_ok=True)

        payload = self._build_payload(anonymize)
        if fmt == "json":
            text = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
        else:
            text = self._render_markdown(payload)

        out_path.write_text(text, encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Сохранено: {out_path} ({len(text)} символов)"))

    def _user_label(self, user_id: int, cache: dict, anonymize: bool) -> str:
        if user_id not in cache:
            u = User.objects.filter(pk=user_id).first()
            if not u:
                cache[user_id] = f"user_id={user_id}"
            elif anonymize:
                cache[user_id] = f"user_{user_id}"
            else:
                cache[user_id] = f"{u.username} <{u.email}>"
        return cache[user_id]

    def _build_payload(self, anonymize: bool) -> dict:
        ucache = {}
        now = timezone.now().isoformat(timespec="seconds")

        def ulabel(uid):
            if uid is None:
                return None
            return self._user_label(uid, ucache, anonymize)

        data = {
            "meta": {
                "generated_at": now,
                "timezone": str(timezone.get_current_timezone()),
                "django_settings_module": str(settings.SETTINGS_MODULE),
                "anonymize": anonymize,
            },
            "counts": {},
        }

        genes = list(Gene.objects.all().order_by("symbol"))
        data["counts"]["Gene"] = len(genes)
        data["genes"] = [
            {
                "id": g.id,
                "symbol": g.symbol,
                "full_name": g.full_name,
                "category": g.category,
                "rs_id": g.rs_id,
                "description": g.description,
                "effect_description": g.effect_description,
            }
            for g in genes
        ]

        variants = list(
            GeneVariant.objects.select_related("gene").all().order_by("gene__symbol", "id")
        )
        data["counts"]["GeneVariant"] = len(variants)
        data["gene_variants"] = [
            {
                "id": v.id,
                "gene": v.gene.symbol,
                "gene_id": v.gene_id,
                "genotype": v.genotype,
                "risk_type": v.risk_type,
                "variant_description": v.variant_description,
            }
            for v in variants
        ]

        recs = list(Recommendation.objects.all().order_by("id"))
        data["counts"]["Recommendation"] = len(recs)
        data["recommendations"] = [
            {
                "id": r.id,
                "title": r.title,
                "description": r.description,
                "category": r.category,
            }
            for r in recs
        ]

        gvr = list(
            GeneVariantRecommendation.objects.select_related("gene_variant", "recommendation").all()
        )
        data["counts"]["GeneVariantRecommendation"] = len(gvr)
        data["gene_variant_recommendations"] = [
            {
                "id": x.id,
                "gene_variant_id": x.gene_variant_id,
                "recommendation_id": x.recommendation_id,
                "gene_variant": str(x.gene_variant),
                "recommendation": x.recommendation.title,
            }
            for x in gvr
        ]

        articles = list(Article.objects.select_related("gene").all().order_by("-created_at"))
        data["counts"]["Article"] = len(articles)
        data["articles"] = [
            {
                "id": a.id,
                "title": a.title,
                "content": a.content,
                "category": a.category,
                "created_at": a.created_at,
                "source_url": a.source_url,
                "author": a.author,
                "gene_id": a.gene_id,
                "gene_symbol": a.gene.symbol if a.gene_id else None,
            }
            for a in articles
        ]

        myths = list(MythTruthQuestion.objects.all().order_by("sort_order", "id"))
        data["counts"]["MythTruthQuestion"] = len(myths)
        data["myth_truth_questions"] = [
            {
                "id": m.id,
                "statement": m.statement,
                "correct_is_truth": m.correct_is_truth,
                "explanation": m.explanation,
                "source_url": m.source_url,
                "sort_order": m.sort_order,
                "is_active": m.is_active,
            }
            for m in myths
        ]

        vitamins = list(Vitamin.objects.all().order_by("name"))
        data["counts"]["Vitamin"] = len(vitamins)
        data["vitamins"] = [
            {
                "id": v.id,
                "name": v.name,
                "description": v.description,
                "daily_norm_value": v.daily_norm_value,
                "upper_limit_value": v.upper_limit_value,
                "unit": v.unit,
                "unit_test": v.unit_test,
                "category": v.category,
                "ref_min": v.ref_min,
                "ref_max": v.ref_max,
                "created_at": v.created_at,
            }
            for v in vitamins
        ]

        gv = list(GeneVitamin.objects.select_related("gene", "vitamin").all())
        data["counts"]["GeneVitamin"] = len(gv)
        data["gene_vitamins"] = [
            {
                "id": x.id,
                "gene": x.gene.symbol,
                "vitamin": x.vitamin.name,
                "effect_description": x.effect_description,
            }
            for x in gv
        ]

        vge = list(
            VitaminGenotypeEffect.objects.select_related("gene_variant", "vitamin").all()
        )
        data["counts"]["VitaminGenotypeEffect"] = len(vge)
        data["vitamin_genotype_effects"] = [
            {
                "id": x.id,
                "gene_variant_id": x.gene_variant_id,
                "vitamin_id": x.vitamin_id,
                "gene_variant": str(x.gene_variant),
                "vitamin": x.vitamin.name,
                "impact_level": x.impact_level,
                "effect_text": x.effect_text,
            }
            for x in vge
        ]

        users = list(
            User.objects.all().order_by("id").values("id", "username", "email", "is_staff", "is_active", "date_joined")
        )
        data["counts"]["User"] = len(users)
        if anonymize:
            data["users"] = [
                {"id": u["id"], "username": f"user_{u['id']}", "email": "[скрыто]", "is_staff": u["is_staff"]}
                for u in users
            ]
        else:
            data["users"] = list(users)

        profiles = list(
            UserProfile.objects.select_related("user").all().order_by("user_id")
        )
        data["counts"]["UserProfile"] = len(profiles)
        data["user_profiles"] = [
            {
                "user": ulabel(p.user_id),
                "user_id": p.user_id,
                "height": p.height,
                "weight": p.weight,
                "activity_level": p.activity_level,
                "diet_preferences": p.diet_preferences,
                "goals_text": p.goals_text,
                "without_genetic_test": p.without_genetic_test,
                "birth_date": p.birth_date,
                "gender": p.gender,
                "updated_at": p.updated_at,
            }
            for p in profiles
        ]

        ugt = list(UserGenotype.objects.select_related("user", "gene_variant__gene").all().order_by("id"))
        data["counts"]["UserGenotype"] = len(ugt)
        data["user_genotypes"] = [
            {
                "id": g.id,
                "user": ulabel(g.user_id),
                "user_id": g.user_id,
                "gene_variant": str(g.gene_variant),
                "gene_variant_id": g.gene_variant_id,
                "created_at": g.created_at,
            }
            for g in ugt
        ]

        urec = list(
            UserRecommendation.objects.select_related("user", "recommendation").all().order_by("id")
        )
        data["counts"]["UserRecommendation"] = len(urec)
        data["user_recommendations"] = [
            {
                "id": r.id,
                "user_id": r.user_id,
                "recommendation_id": r.recommendation_id,
                "user": ulabel(r.user_id),
                "recommendation": r.recommendation.title,
                "status": r.status,
                "created_at": r.created_at,
            }
            for r in urec
        ]

        vtr = list(
            VitaminTestResult.objects.select_related("user", "vitamin").all().order_by("-test_date", "id")
        )
        data["counts"]["VitaminTestResult"] = len(vtr)
        data["vitamin_test_results"] = [
            {
                "id": t.id,
                "user_id": t.user_id,
                "vitamin_id": t.vitamin_id,
                "user": ulabel(t.user_id),
                "vitamin": t.vitamin.name,
                "test_value": t.test_value,
                "test_date": t.test_date,
                "status": t.status,
            }
            for t in vtr
        ]

        dps = list(
            DoctorPatient.objects.select_related("doctor", "patient").all().order_by("id")
        )
        data["counts"]["DoctorPatient"] = len(dps)
        data["doctor_patients"] = [
            {
                "id": d.id,
                "doctor_id": d.doctor_id,
                "patient_id": d.patient_id,
                "doctor": ulabel(d.doctor_id),
                "patient": ulabel(d.patient_id),
                "created_at": d.created_at,
            }
            for d in dps
        ]

        dcs = list(
            DoctorComment.objects.select_related("doctor", "patient").all().order_by("-created_at")
        )
        data["counts"]["DoctorComment"] = len(dcs)
        data["doctor_comments"] = [
            {
                "id": c.id,
                "doctor_id": c.doctor_id,
                "patient_id": c.patient_id,
                "doctor": ulabel(c.doctor_id),
                "patient": ulabel(c.patient_id),
                "genotype_id": c.genotype_id,
                "vitamin_test_id": c.vitamin_test_id,
                "text": c.text,
                "status": c.status,
                "created_at": c.created_at,
            }
            for c in dcs
        ]

        dch = list(
            DoctorCommentHistory.objects.select_related("comment", "edited_by").all().order_by("-edited_at")
        )
        data["counts"]["DoctorCommentHistory"] = len(dch)
        data["doctor_comment_history"] = [
            {
                "id": h.id,
                "comment_id": h.comment_id,
                "edited_by_id": h.edited_by_id,
                "edited_by": ulabel(h.edited_by_id),
                "previous_text": h.previous_text,
                "previous_status": h.previous_status,
                "previous_genotype_id": h.previous_genotype_id,
                "previous_vitamin_test_id": h.previous_vitamin_test_id,
                "edited_at": h.edited_at,
            }
            for h in dch
        ]

        aps = list(
            InPersonAppointment.objects.select_related("patient", "doctor").all().order_by("-created_at")
        )
        data["counts"]["InPersonAppointment"] = len(aps)
        data["in_person_appointments"] = [
            {
                "id": a.id,
                "patient_id": a.patient_id,
                "doctor_id": a.doctor_id,
                "patient": ulabel(a.patient_id),
                "doctor": ulabel(a.doctor_id),
                "requested_start": a.requested_start,
                "confirmed_start": a.confirmed_start,
                "patient_note": a.patient_note,
                "doctor_message": a.doctor_message,
                "status": a.status,
                "created_at": a.created_at,
            }
            for a in aps
        ]

        pns = list(
            PatientNotification.objects.select_related("user", "comment", "appointment").all().order_by(
                "-created_at"
            )
        )
        data["counts"]["PatientNotification"] = len(pns)
        data["patient_notifications"] = [
            {
                "id": n.id,
                "user_id": n.user_id,
                "user": ulabel(n.user_id),
                "comment_id": n.comment_id,
                "appointment_id": n.appointment_id,
                "title": n.title,
                "body": n.body,
                "is_read": n.is_read,
                "created_at": n.created_at,
            }
            for n in pns
        ]

        return data

    def _render_markdown(self, d: dict) -> str:
        lines = [
            "# Экспорт базы данных (genapp)",
            "",
            f"Сформировано: **{d['meta']['generated_at']}**  ",
            f"Анонимизация: **{d['meta']['anonymize']}**  ",
            "",
            "## Сводка по количеству записей",
            "",
            "| Модель | Записей |",
            "|--------|--------:|",
        ]
        for k, n in sorted(d["counts"].items(), key=lambda x: x[0].lower()):
            lines.append(f"| {k} | {n} |")
        lines.append("")

        sections = [
            ("Гены (справочник)", "genes", ["id", "symbol", "full_name", "category", "rs_id", "description", "effect_description"]),
            ("Варианты генов", "gene_variants", None),
            ("Рекомендации", "recommendations", None),
            ("Связи вариант — рекомендация", "gene_variant_recommendations", None),
            ("Статьи", "articles", None),
            ("Вопросы «миф / правда»", "myth_truth_questions", None),
            ("Витамины (справочник)", "vitamins", None),
            ("Связи ген — витамин", "gene_vitamins", None),
            ("Влияния генотипа на витамин", "vitamin_genotype_effects", None),
            ("Пользователи Django", "users", None),
            ("Профили", "user_profiles", None),
            ("Генотипы пользователей", "user_genotypes", None),
            ("Персональные рекомендации пользователей", "user_recommendations", None),
            ("Анализы витаминов", "vitamin_test_results", None),
            ("Связи врач — пациент", "doctor_patients", None),
            ("Комментарии врача", "doctor_comments", None),
            ("История правок комментариев", "doctor_comment_history", None),
            ("Заявки на приём", "in_person_appointments", None),
            ("Уведомления пациентов", "patient_notifications", None),
        ]

        for title, key, _ in sections:
            rows = d.get(key) or []
            if not rows:
                lines.append(f"## {title}")
                lines.append("")
                lines.append("_Нет записей._")
                lines.append("")
                continue
            lines.append(f"## {title} ({len(rows)})")
            lines.append("")
            if key == "genes" and rows:
                for g in rows:
                    lines.append(f"### {g.get('symbol')} (id {g.get('id')})")
                    lines.append("")
                    for k2, v2 in g.items():
                        if v2 in (None, ""):
                            continue
                        v2s = str(v2).replace("\r\n", "\n")
                        if "\n" in v2s:
                            lines.append(f"**{k2}:**")
                            lines.append("")
                            lines.append("```")
                            lines.append(v2s)
                            lines.append("```")
                            lines.append("")
                        else:
                            lines.append(f"- **{k2}:** {v2s}")
                    lines.append("")
            else:
                for i, row in enumerate(rows, 1):
                    lines.append(f"### Запись {i} (id {row.get('id', '—')})" if "id" in row else f"### Запись {i}")
                    lines.append("")
                    for k2, v2 in row.items():
                        if v2 in (None, "") and k2 not in ("is_active", "is_read", "correct_is_truth"):
                            continue
                        v2s = str(v2).replace("\r\n", "\n")
                        if len(v2s) > 400 or "\n" in v2s:
                            lines.append(f"**{k2}:**")
                            lines.append("")
                            lines.append("```")
                            lines.append(v2s[:20000] + ("…" if len(v2s) > 20000 else ""))
                            lines.append("```")
                            lines.append("")
                        else:
                            lines.append(f"- **{k2}:** {v2s}")
                    lines.append("")

        return "\n".join(lines)
