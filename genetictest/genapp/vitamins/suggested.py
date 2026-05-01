"""Подсказки витаминов для сдачи анализов: тест симптомов + генетические рекомендации (категория «Витамины»)."""

from __future__ import annotations

from genapp.models import GeneVitamin, SymptomTestItem, UserProfile, Vitamin


def _vitamin_name_matches_substrings(name_lower: str, substrings: list) -> bool:
    for s in substrings or []:
        frag = (s or "").strip().lower()
        if frag and frag in name_lower:
            return True
    return False


def vitamin_scores_for_symptom_items(selected_item_ids: list[str]) -> list[tuple[int, int]]:
    """
    Та же логика, что buildVitaminScoreMap в SPA: для каждого витамина — число отмеченных
    пунктов теста, у которых хотя бы одна подстрока входит в название витамина.
    Возвращает (vitamin_id, score) по убыванию score.
    """
    if not selected_item_ids:
        return []
    items = list(
        SymptomTestItem.objects.filter(item_id__in=selected_item_ids, is_active=True).only(
            "item_id", "vitamin_substrings"
        )
    )
    if not items:
        return []

    scored: list[tuple[int, int]] = []
    for v in Vitamin.objects.all().only("id", "name"):
        name_lower = (v.name or "").lower()
        sc = 0
        for item in items:
            if _vitamin_name_matches_substrings(name_lower, item.vitamin_substrings or []):
                sc += 1
        if sc > 0:
            scored.append((v.id, sc))
    scored.sort(key=lambda x: -x[1])
    return scored


def vitamin_ids_from_genetics(user) -> list[int]:
    """
    Рекомендации с category=vitamins для генотипа пациента → гены → GeneVitamin → витамины.
    Режим wellness (без генетики) не использует этот источник.
    """
    profile = UserProfile.objects.filter(user=user).first()
    if profile and profile.without_genetic_test:
        return []

    from genapp.recommendations.services import get_interpretation

    interp = get_interpretation(user)
    categories = interp.get("categories") or {}
    block = categories.get("vitamins") or {}
    recs = block.get("recommendations") or []
    symbols: set[str] = set()
    for r in recs:
        for g in r.get("genes") or []:
            if not isinstance(g, str):
                continue
            part = g.split(":", 1)[0].strip().upper()
            if part:
                symbols.add(part)
    if not symbols:
        return []

    return list(
        GeneVitamin.objects.filter(gene__symbol__in=symbols)
        .values_list("vitamin_id", flat=True)
        .distinct()
        .order_by("vitamin_id")
    )


def merge_suggested_vitamin_ids(symptom_ordered_ids: list[int], genetics_ids: list[int]) -> list[int]:
    """Сначала витамины по симптомам (уже упорядочены), затем генетика без дубликатов."""
    out: list[int] = []
    seen: set[int] = set()
    for vid in symptom_ordered_ids:
        if vid not in seen:
            seen.add(vid)
            out.append(vid)
    for vid in genetics_ids:
        if vid not in seen:
            seen.add(vid)
            out.append(vid)
    return out
