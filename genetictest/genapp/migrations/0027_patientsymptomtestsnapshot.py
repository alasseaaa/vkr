from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("genapp", "0026_remove_recommendationreminder_timestamps"),
    ]

    operations = [
        migrations.CreateModel(
            name="PatientSymptomTestSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("selected_item_ids", models.JSONField(default=list, verbose_name="Отмеченные пункты (item_id)")),
                (
                    "vitamin_ids",
                    models.JSONField(
                        default=list,
                        verbose_name="ID витаминов из каталога (порядок — по убыванию релевантности)",
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлено")),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=models.CASCADE,
                        related_name="symptom_test_snapshot",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
            ],
            options={
                "verbose_name": "Снимок теста по симптомам",
                "verbose_name_plural": "Снимки теста по симптомам",
            },
        ),
    ]
