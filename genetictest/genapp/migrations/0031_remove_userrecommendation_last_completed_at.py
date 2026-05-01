# Generated manually

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0030_patientmythtruthresult"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="userrecommendation",
            name="last_completed_at",
        ),
    ]
