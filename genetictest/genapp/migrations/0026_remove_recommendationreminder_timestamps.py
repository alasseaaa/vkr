from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0025_remove_recommendation_created_at"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="recommendationreminder",
            name="created_at",
        ),
        migrations.RemoveField(
            model_name="recommendationreminder",
            name="updated_at",
        ),
    ]
