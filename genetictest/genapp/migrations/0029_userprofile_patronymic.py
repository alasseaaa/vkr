from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0028_patientvitaminintake"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="patronymic",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Обязательно для полного ФИО в сервисе.",
                max_length=64,
                verbose_name="Отчество",
            ),
        ),
    ]
