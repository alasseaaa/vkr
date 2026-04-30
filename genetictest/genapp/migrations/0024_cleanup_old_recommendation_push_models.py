from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0023_recommendation_reminder_and_patient_notification_link"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="userrecommendation",
            name="reminder_interval_days",
        ),
        migrations.DeleteModel(
            name="RecommendationPushNotification",
        ),
        migrations.DeleteModel(
            name="UserRecommendationHistory",
        ),
    ]
