# Generated manually

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0033_remove_vitamin_upper_limit_value"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="vitamin",
            name="daily_norm_value",
        ),
    ]
