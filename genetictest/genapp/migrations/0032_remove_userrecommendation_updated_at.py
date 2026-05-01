# Generated manually

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0031_remove_userrecommendation_last_completed_at"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="userrecommendation",
            name="updated_at",
        ),
    ]
