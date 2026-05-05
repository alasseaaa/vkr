# Generated manually

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0032_remove_userrecommendation_updated_at"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="vitamin",
            name="upper_limit_value",
        ),
    ]
