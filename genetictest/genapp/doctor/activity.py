"""Сводная лента событий по пациентам врача (генотипы, анализы, опубликованные комментарии)."""

from __future__ import annotations

from datetime import datetime, time

from django.utils import timezone

from genapp.models import DoctorComment, DoctorPatient, UserGenotype, VitaminTestResult
from genapp.users.fio import format_fio_ru


def get_doctor_patient_activity(doctor, *, limit: int = 50) -> list[dict]:
    patient_ids = list(DoctorPatient.objects.filter(doctor=doctor).values_list("patient_id", flat=True))
    if not patient_ids:
        return []

    per_source = max(limit, 20)
    events: list[dict] = []

    for g in (
        UserGenotype.objects.filter(user_id__in=patient_ids)
        .select_related("user__userprofile", "gene_variant__gene")
        .order_by("-created_at")[:per_source]
    ):
        sym = getattr(getattr(g.gene_variant, "gene", None), "symbol", None) or "?"
        gt = getattr(g.gene_variant, "genotype", None) or ""
        detail = f"{sym} ({gt})".replace(" ()", "").strip()
        events.append(
            {
                "id": f"g-{g.id}",
                "type": "genotype_added",
                "created_at": timezone.localtime(g.created_at).isoformat(),
                "patient_id": g.user_id,
                "patient_label": format_fio_ru(g.user),
                "title": "Добавлен генотип",
                "detail": detail,
            }
        )

    for vt in (
        VitaminTestResult.objects.filter(user_id__in=patient_ids)
        .select_related("user__userprofile", "vitamin")
        .order_by("-test_date", "-id")[:per_source]
    ):
        when = datetime.combine(vt.test_date, time(12, 0, 0))
        if timezone.is_naive(when):
            when = timezone.make_aware(when, timezone.get_current_timezone())
        events.append(
            {
                "id": f"v-{vt.id}",
                "type": "vitamin_test_added",
                "created_at": timezone.localtime(when).isoformat(),
                "patient_id": vt.user_id,
                "patient_label": format_fio_ru(vt.user),
                "title": "Анализ витамина",
                "detail": f"{vt.vitamin.name}: {vt.test_value}",
            }
        )

    for c in (
        DoctorComment.objects.filter(doctor=doctor, patient_id__in=patient_ids, status="published")
        .select_related("patient__userprofile")
        .order_by("-created_at")[:per_source]
    ):
        text = (c.text or "").strip()
        short = text[:120] + ("…" if len(text) > 120 else "")
        events.append(
            {
                "id": f"c-{c.id}",
                "type": "doctor_comment_published",
                "created_at": timezone.localtime(c.created_at).isoformat(),
                "patient_id": c.patient_id,
                "patient_label": format_fio_ru(c.patient),
                "title": "Опубликован комментарий",
                "detail": short or "—",
            }
        )

    events.sort(key=lambda x: x["created_at"], reverse=True)
    return events[:limit]
