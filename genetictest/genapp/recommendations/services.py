from collections import defaultdict
from datetime import timedelta

from django.utils import timezone

from genapp.models import (
    GeneVariantRecommendation,
    PatientNotification,
    Recommendation,
    RecommendationReminder,
    UserGenotype,
    UserRecommendation,
)


def _get_user_variant_ids(user):
    return list(
        UserGenotype.objects.filter(user=user).values_list("gene_variant_id", flat=True).distinct()
    )


def get_interpretation(user):
    """
    Интерпретирует генотип пользователя через связанные рекомендации.

    Возвращает JSON-подобный dict:
    {
      "categories": {
        "<category>": {
          "label": "...",
          "recommendations": [
             {"id":..., "title":..., "description":..., "genes":[...]}
          ]
        }
      }
    }
    """
    variant_ids = _get_user_variant_ids(user)

    if not variant_ids:
        return {"categories": {}}

    recommendations = (
        Recommendation.objects.filter(genevariantrecommendation__gene_variant_id__in=variant_ids)
        .distinct()
        .all()
    )

    rec_ids = list(recommendations.values_list("id", flat=True))

    # Собираем, какие гены/генотипы пользователя привели к каждой рекомендации.
    links_qs = (
        GeneVariantRecommendation.objects.filter(recommendation_id__in=rec_ids, gene_variant_id__in=variant_ids)
        .select_related("gene_variant__gene", "gene_variant")
    )

    rec_to_genes = defaultdict(set)  # rec_id -> set("GENE:GT")
    for link in links_qs:
        gene = link.gene_variant.gene
        rec_to_genes[link.recommendation_id].add(f"{gene.symbol}:{link.gene_variant.genotype}")

    grouped = {}
    for rec in recommendations:
        if rec.category not in grouped:
            grouped[rec.category] = {"label": rec.get_category_display(), "recommendations": []}

        grouped[rec.category]["recommendations"].append(
            {
                "id": rec.id,
                "title": rec.title,
                "description": rec.description,
                "genes": sorted(rec_to_genes.get(rec.id, [])),
            }
        )

    return {"categories": grouped}


def get_user_recommendations(user):
    """
    Рекомендации для пациента + статус из UserRecommendation (если он задан).
    """
    interpretation = get_interpretation(user)
    if not interpretation["categories"]:
        return interpretation

    # Вытаскиваем все recommendation_id из результата, чтобы загрузить статусы одним запросом.
    rec_ids = []
    for cat in interpretation["categories"].values():
        for rec in cat["recommendations"]:
            rec_ids.append(rec["id"])

    existing_ids = set(
        UserRecommendation.objects.filter(user=user, recommendation_id__in=rec_ids).values_list(
            "recommendation_id", flat=True
        )
    )
    to_create = [rid for rid in rec_ids if rid not in existing_ids]
    if to_create:
        UserRecommendation.objects.bulk_create(
            [UserRecommendation(user=user, recommendation_id=rid, status="new") for rid in to_create],
            ignore_conflicts=True,
        )

    state_qs = UserRecommendation.objects.filter(user=user, recommendation_id__in=rec_ids).values(
        "id",
        "recommendation_id",
        "status",
        "is_habit_tracking_enabled",
        "last_reminder_sent_at",
    )
    state_map = {x["recommendation_id"]: x for x in state_qs}

    for cat in interpretation["categories"].values():
        for rec in cat["recommendations"]:
            state = state_map.get(rec["id"])
            rec["user_status"] = state.get("status") if state else None
            rec["user_recommendation_id"] = state.get("id") if state else None
            rec["is_habit_tracking_enabled"] = (
                bool(state.get("is_habit_tracking_enabled")) if state else True
            )
            rec["last_reminder_sent_at"] = state.get("last_reminder_sent_at") if state else None

    return interpretation


def ensure_due_recommendation_reminders(user):
    """
    Создаёт in-app напоминания по рекомендациям раз в interval_days.
    Напоминания повторяются даже после отметки "выполнено",
    пока пользователь не отключил "не напоминать".
    """
    now = timezone.now()
    user_recs = (
        UserRecommendation.objects.select_related("recommendation")
        .prefetch_related("recommendation__reminders")
        .filter(user=user, is_habit_tracking_enabled=True)
    )
    created = 0
    for ur in user_recs:
        reminder = next((r for r in ur.recommendation.reminders.all() if r.is_active), None)
        interval_days = reminder.interval_days if reminder else 7
        base_dt = ur.last_reminder_sent_at or ur.created_at or now
        if base_dt + timedelta(days=interval_days) > now:
            continue
        has_unread = PatientNotification.objects.filter(
            user=user, user_recommendation=ur, is_read=False
        ).exists()
        if has_unread:
            continue
        text = (reminder.prompt_text.strip() if reminder and reminder.prompt_text else "").strip()
        if not text:
            text = f"А вы следуете рекомендации: {ur.recommendation.title.lower()}?"
        PatientNotification.objects.create(
            user=user,
            user_recommendation=ur,
            title=ur.recommendation.title,
            body=text,
        )
        ur.last_reminder_sent_at = now
        ur.save(update_fields=["last_reminder_sent_at"])
        created += 1
    return created

