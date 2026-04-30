from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0022_remove_webpushsubscription"),
    ]

    operations = [
        migrations.CreateModel(
            name="RecommendationReminder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("prompt_text", models.TextField(verbose_name="Текст напоминания")),
                ("interval_days", models.PositiveIntegerField(default=7, verbose_name="Интервал повтора (дни)")),
                ("is_active", models.BooleanField(default=True, verbose_name="Активно")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создано")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлено")),
                (
                    "recommendation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reminders",
                        to="genapp.recommendation",
                        verbose_name="Рекомендация",
                    ),
                ),
            ],
            options={
                "verbose_name": "Напоминание к рекомендации",
                "verbose_name_plural": "Напоминания к рекомендациям",
                "ordering": ["recommendation_id", "id"],
            },
        ),
        migrations.AddField(
            model_name="patientnotification",
            name="user_recommendation",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="patient_notifications",
                to="genapp.userrecommendation",
                verbose_name="Пользовательская рекомендация",
            ),
        ),
    ]
