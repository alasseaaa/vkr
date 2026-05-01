"""Форматирование ФИО (фамилия, имя, отчество из профиля)."""

from __future__ import annotations

from genapp.models import UserProfile


def get_patronymic(user) -> str:
    try:
        return (user.userprofile.patronymic or "").strip()
    except UserProfile.DoesNotExist:
        return ""


def format_fio_ru(user) -> str:
    """«Фамилия Имя Отчество»; при отсутствии частей — запасные варианты."""
    ln = (user.last_name or "").strip()
    fn = (user.first_name or "").strip()
    pat = get_patronymic(user)
    parts = [p for p in (ln, fn, pat) if p]
    if parts:
        return " ".join(parts)
    full = (user.get_full_name() or "").strip()
    if full:
        return full
    return user.username or str(user.pk)
