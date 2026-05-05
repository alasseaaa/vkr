# Generated manually

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0034_remove_vitamin_daily_norm_value"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="vitamin",
            name="unit",
        ),
    ]
