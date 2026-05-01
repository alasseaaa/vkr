import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("genapp", "0027_patientsymptomtestsnapshot"),
    ]

    operations = [
        migrations.CreateModel(
            name="PatientVitaminIntake",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("started_on", models.DateField(verbose_name="Начало приёма")),
                (
                    "ended_on",
                    models.DateField(
                        blank=True,
                        help_text="Пусто — принимаю сейчас",
                        null=True,
                        verbose_name="Окончание приёма",
                    ),
                ),
                (
                    "dose_note",
                    models.CharField(
                        blank=True,
                        help_text="Например: 400 МЕ, капсулы",
                        max_length=255,
                        verbose_name="Дозировка / форма",
                    ),
                ),
                ("notes", models.TextField(blank=True, verbose_name="Заметки")),
                (
                    "photo",
                    models.ImageField(
                        blank=True,
                        null=True,
                        upload_to="vitamin_intake/%Y/%m/",
                        verbose_name="Фото упаковки",
                    ),
                ),
                (
                    "suggested_from",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("manual", "Вручную"),
                            ("symptoms", "Тест симптомов"),
                            ("genetics", "Генетика"),
                            ("both", "Симптомы и генетика"),
                        ],
                        max_length=16,
                        verbose_name="Источник подсказки",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создано")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлено")),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="vitamin_intakes",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
                (
                    "vitamin",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="genapp.vitamin",
                        verbose_name="Витамин",
                    ),
                ),
            ],
            options={
                "verbose_name": "Приём витамина (курс)",
                "verbose_name_plural": "Приёмы витаминов (курсы)",
                "ordering": ["-started_on", "-id"],
            },
        ),
    ]
