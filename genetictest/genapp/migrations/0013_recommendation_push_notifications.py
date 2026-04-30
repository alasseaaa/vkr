from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0012_inpersonappointment_patientnotification_appointment"),
    ]

    operations = [
        migrations.AddField(
            model_name="userrecommendation",
            name="is_habit_tracking_enabled",
            field=models.BooleanField(default=True, verbose_name="Отслеживание привычки включено"),
        ),
        migrations.AddField(
            model_name="userrecommendation",
            name="last_completed_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Последнее выполнение"),
        ),
        migrations.AddField(
            model_name="userrecommendation",
            name="last_reminder_sent_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Последнее отправленное напоминание"),
        ),
        migrations.AddField(
            model_name="userrecommendation",
            name="reminder_interval_days",
            field=models.PositiveIntegerField(default=30, verbose_name="Интервал напоминаний (дни)"),
        ),
        migrations.CreateModel(
            name="RecommendationPushNotification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("prompt_text", models.TextField(verbose_name="Текст подсказки")),
                (
                    "reminder_type",
                    models.CharField(
                        choices=[
                            ("initial", "Первое напоминание"),
                            ("habit_maintenance", "Поддержание привычки"),
                            ("motivation", "Мотивационное"),
                        ],
                        default="initial",
                        max_length=32,
                        verbose_name="Тип напоминания",
                    ),
                ),
                ("scheduled_for", models.DateTimeField(verbose_name="Запланировано на")),
                ("sent_at", models.DateTimeField(blank=True, null=True, verbose_name="Отправлено")),
                ("clicked_at", models.DateTimeField(blank=True, null=True, verbose_name="Нажато")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Ожидает"),
                            ("sent", "Отправлено"),
                            ("clicked", "Клик"),
                            ("dismissed", "Отклонено"),
                            ("completed", "Выполнено"),
                        ],
                        default="pending",
                        max_length=16,
                        verbose_name="Статус",
                    ),
                ),
                ("reminder_number", models.PositiveIntegerField(default=1, verbose_name="Номер напоминания")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создано")),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="recommendation_push_notifications",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
                (
                    "user_recommendation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="push_notifications",
                        to="genapp.userrecommendation",
                        verbose_name="Пользовательская рекомендация",
                    ),
                ),
            ],
            options={
                "verbose_name": "Пуш-уведомление по рекомендации",
                "verbose_name_plural": "Пуш-уведомления по рекомендациям",
                "ordering": ["-scheduled_for", "-created_at"],
                "indexes": [
                    models.Index(fields=["user", "status", "scheduled_for"], name="genapp_reco_user_id_26cb87_idx"),
                    models.Index(fields=["status", "scheduled_for"], name="genapp_reco_status_4f0b53_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="UserRecommendationHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "completed_at",
                    models.DateTimeField(default=django.utils.timezone.now, verbose_name="Когда отмечено выполненным"),
                ),
                ("notes", models.TextField(blank=True, default="", verbose_name="Заметки")),
                (
                    "user_recommendation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="history_entries",
                        to="genapp.userrecommendation",
                        verbose_name="Пользовательская рекомендация",
                    ),
                ),
            ],
            options={
                "verbose_name": "История выполнения рекомендации",
                "verbose_name_plural": "История выполнения рекомендаций",
                "ordering": ["-completed_at"],
            },
        ),
        migrations.CreateModel(
            name="WebPushSubscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("endpoint", models.URLField(verbose_name="Push endpoint")),
                ("p256dh", models.TextField(verbose_name="Ключ p256dh")),
                ("auth", models.TextField(verbose_name="Ключ auth")),
                ("is_active", models.BooleanField(default=True, verbose_name="Активна")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создано")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлено")),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="web_push_subscriptions",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пользователь",
                    ),
                ),
            ],
            options={
                "verbose_name": "WebPush подписка",
                "verbose_name_plural": "WebPush подписки",
                "indexes": [models.Index(fields=["user", "is_active"], name="genapp_webp_user_id_9e3071_idx")],
                "unique_together": {("user", "endpoint")},
            },
        ),
    ]

