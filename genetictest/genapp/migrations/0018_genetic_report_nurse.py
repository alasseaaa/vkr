# Manual migration: genetic PDF uploads + nurse notifications

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def create_nurse_group(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.get_or_create(name="nurse")


def remove_nurse_group(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name="nurse").delete()


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("genapp", "0017_userprofile_consent"),
    ]

    operations = [
        migrations.CreateModel(
            name="GeneticReportUpload",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "file",
                    models.FileField(
                        max_length=512,
                        upload_to="genetic_reports/%Y/%m/",
                        verbose_name="PDF-файл",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "В очереди"),
                            ("processing", "В работе"),
                            ("done", "Обработано"),
                            ("rejected", "Отклонено"),
                        ],
                        default="pending",
                        max_length=16,
                        verbose_name="Статус",
                    ),
                ),
                ("admin_note", models.TextField(blank=True, verbose_name="Комментарий (медсестра)")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создано")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Обновлено")),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="genetic_report_uploads",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Пациент",
                    ),
                ),
                (
                    "processed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="processed_genetic_report_uploads",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Кто обработал",
                    ),
                ),
            ],
            options={
                "verbose_name": "Загрузка генетического PDF",
                "verbose_name_plural": "Загрузки генетических PDF",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="NurseNotification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_read", models.BooleanField(default=False, verbose_name="Прочитано")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Создано")),
                (
                    "upload",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="nurse_notifications",
                        to="genapp.geneticreportupload",
                        verbose_name="Заявка",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="nurse_upload_notifications",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Медсестра",
                    ),
                ),
            ],
            options={
                "verbose_name": "Уведомление медсестры (PDF)",
                "verbose_name_plural": "Уведомления медсестр (PDF)",
                "ordering": ["-created_at"],
                "unique_together": {("user", "upload")},
            },
        ),
        migrations.RunPython(create_nurse_group, remove_nurse_group),
    ]
