from django.db import migrations, models


def seed_symptom_items(apps, schema_editor):
    SymptomTestItem = apps.get_model("genapp", "SymptomTestItem")
    from genapp.symptom_seed_data import SYMPTOM_SEED

    for i, row in enumerate(SYMPTOM_SEED):
        SymptomTestItem.objects.update_or_create(
            item_id=row["id"],
            defaults={
                "group": row["group"],
                "label": row["label"],
                "gene_symbols": list(row.get("geneSymbols") or []),
                "vitamin_substrings": list(row.get("vitaminSubstrings") or []),
                "sort_order": i,
                "is_active": True,
            },
        )


def unseed(apps, schema_editor):
    SymptomTestItem = apps.get_model("genapp", "SymptomTestItem")
    SymptomTestItem.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0018_genetic_report_nurse"),
    ]

    operations = [
        migrations.CreateModel(
            name="SymptomTestItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "item_id",
                    models.SlugField(max_length=64, unique=True, verbose_name="ID пункта"),
                ),
                (
                    "group",
                    models.CharField(max_length=128, verbose_name="Группа"),
                ),
                (
                    "label",
                    models.TextField(verbose_name="Формулировка симптома"),
                ),
                (
                    "gene_symbols",
                    models.JSONField(default=list, verbose_name="Символы генов"),
                ),
                (
                    "vitamin_substrings",
                    models.JSONField(
                        default=list, verbose_name="Подстроки витаминов (поиск)"
                    ),
                ),
                (
                    "sort_order",
                    models.PositiveIntegerField(default=0, verbose_name="Порядок"),
                ),
                (
                    "is_active",
                    models.BooleanField(default=True, verbose_name="Активен"),
                ),
            ],
            options={
                "verbose_name": "Пункт теста по симптомам",
                "verbose_name_plural": "Тест по симптомам (пункты)",
                "ordering": ["sort_order", "item_id"],
            },
        ),
        migrations.RunPython(seed_symptom_items, unseed),
    ]
