import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("genapp", "0029_userprofile_patronymic"),
    ]

    operations = [
        migrations.CreateModel(
            name="PatientMythTruthResult",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("question_set_signature", models.CharField(max_length=64, verbose_name="Подпись набора активных вопросов")),
                ("score", models.PositiveSmallIntegerField(verbose_name="Верных ответов")),
                ("total", models.PositiveSmallIntegerField(verbose_name="Всего вопросов")),
                ("result_items", models.JSONField(default=list, verbose_name="Разбор по пунктам")),
                ("completed_at", models.DateTimeField(auto_now=True, verbose_name="Завершено")),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="myth_truth_result",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
            ],
            options={
                "verbose_name": "Результат теста «Миф или правда»",
                "verbose_name_plural": "Результаты теста «Миф или правда»",
            },
        ),
    ]
