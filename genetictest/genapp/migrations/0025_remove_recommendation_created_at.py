from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0024_cleanup_old_recommendation_push_models"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="recommendation",
            name="created_at",
        ),
    ]
