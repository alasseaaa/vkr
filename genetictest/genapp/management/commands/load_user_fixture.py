"""
Загрузка стандартной фикстуры Django (массив: model, pk, fields).
Исправления: model genavitamin → genapp.genevitamin, добавляются витамины 2 и 8 при ссылках,
удаляются genevariantrecommendation, если в файле нет вариантов 5,6,8,9.
Порядок: gene → vitamin → genevariant → genevitamin → vitamingenotypeeffect → recommendation → genevariantrecommendation
"""
import json
import re
import sys
from io import StringIO
from pathlib import Path

from django.core import serializers
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone


def _fix_row(row: dict) -> dict:
    m = row.get("model", "")
    if m == "genapp.genavitamin":
        row = {**row, "model": "genapp.genevitamin"}
    return row


def _vitamin_pks_referenced(rows: list) -> set:
    out = set()
    for r in rows:
        m = r.get("model", "")
        f = r.get("fields") or {}
        if m in ("genapp.genevitamin", "genapp.vitamingenotypeeffect") and f.get("vitamin") is not None:
            out.add(f["vitamin"])
    return out


def _add_vitamins_2_8(rows: list) -> list:
    """Справочные витамины 2 и 8 только если на них ссылаются в файле, но строк витамина с таким pk нет."""
    have = {r.get("pk") for r in rows if r.get("model") == "genapp.vitamin"}
    referenced = _vitamin_pks_referenced(rows)
    need = ({2, 8} & referenced) - have
    extra = []
    ts = timezone.now().replace(microsecond=0).isoformat()
    if 2 in need:
        extra.append(
            {
                "model": "genapp.vitamin",
                "pk": 2,
                "fields": {
                    "name": "Витамин C (аскорбиновая кислота)",
                    "description": "Справочник: кофактор синтеза коллагена (для связей ген–витамин).",
                    "daily_norm_value": 90,
                    "upper_limit_value": 2000,
                    "unit": "мг",
                    "unit_test": "мг/л",
                    "category": "water-soluble",
                    "ref_min": 0.2,
                    "ref_max": 1.2,
                    "created_at": ts,
                },
            }
        )
    if 8 in need:
        extra.append(
            {
                "model": "genapp.vitamin",
                "pk": 8,
                "fields": {
                    "name": "Селен",
                    "description": "Справочник: кофактор антиоксидантных ферментов.",
                    "daily_norm_value": 55,
                    "upper_limit_value": 400,
                    "unit": "мкг",
                    "unit_test": "мкг/л",
                    "category": "water-soluble",
                    "ref_min": 70,
                    "ref_max": 150,
                    "created_at": ts,
                },
            }
        )
    if not extra:
        return rows
    ins = next((i for i, r in enumerate(rows) if r.get("model") == "genapp.vitamin"), len(rows))
    return rows[:ins] + extra + rows[ins:]


def _fill_auto_now_add_if_missing(obj) -> None:
    inst = obj.object
    for field in inst._meta.local_concrete_fields:
        if getattr(field, "auto_now_add", False) and not getattr(inst, field.attname, None):
            setattr(inst, field.attname, timezone.now())


def _remove_orphan_gvr(rows: list) -> list:
    gvpks = {r.get("pk") for r in rows if r.get("model") == "genapp.genevariant"}
    need = {5, 6, 8, 9} - gvpks
    if not need:
        return rows
    return [
        r
        for r in rows
        if not (
            r.get("model") == "genapp.genevariantrecommendation"
            and r.get("fields", {}).get("gene_variant") in need
        )
    ]


def _reorder(rows: list) -> list:
    by_m = {
        "genapp.gene": 0,
        "genapp.vitamin": 1,
        "genapp.genevariant": 2,
        "genapp.genevitamin": 3,
        "genapp.vitamingenotypeeffect": 4,
        "genapp.recommendation": 5,
        "genapp.genevariantrecommendation": 6,
    }

    def k(r):
        m = r.get("model", "")
        return (by_m.get(m, 10), r.get("pk") or 0)

    return sorted(rows, key=k)


class Command(BaseCommand):
    help = "Загрузка фикстуры model/pk/fields (Django) с мелкими исправлениями. Использование: path или - для stdin."

    def add_arguments(self, parser):
        parser.add_argument("json_path", type=str, nargs="?", help="Путь к .json или - для stdin")
        parser.add_argument(
            "--keep-temp",
            action="store_true",
            help="Оставить _fixed.json рядом с исходником (отладка).",
        )

    def handle(self, *args, **options):
        src = options.get("json_path") or "-"
        if src in ("", "-", None) or (isinstance(src, str) and src.strip() == "-"):
            text = sys.stdin.read()
            stem = "stdin"
            parent = Path.cwd() / "genapp" / "fixtures"
        else:
            p = Path(src)
            if not p.is_file():
                raise CommandError(f"Нет файла: {p}")
            text = p.read_text(encoding="utf-8")
            stem = p.stem
            parent = p.parent
        text = re.sub(
            r'"model"\s*:\s*"genapp\.genavitamin"',
            '"model": "genapp.genevitamin"',
            text,
        )
        try:
            rows = json.loads(text)
        except json.JSONDecodeError as e:
            raise CommandError(f"JSON: {e}") from e
        if not isinstance(rows, list):
            raise CommandError("Ожидается JSON-массив")
        rows = [_fix_row(r) for r in rows]
        rows = _add_vitamins_2_8(rows)
        rows = _remove_orphan_gvr(rows)
        rows = _reorder(rows)
        out = json.dumps(rows, ensure_ascii=False)
        tmp = parent / f"{stem}_fixed.json"
        if options.get("keep_temp"):
            tmp.write_text(out, encoding="utf-8")
            self.stdout.write(f"Сохранён черновик: {tmp}")
        n = 0
        with transaction.atomic():
            for obj in serializers.deserialize("json", StringIO(out)):
                _fill_auto_now_add_if_missing(obj)
                obj.save()
                n += 1
        self.stdout.write(self.style.SUCCESS(f"Импортировано объектов: {n}"))
