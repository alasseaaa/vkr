from rest_framework import serializers

from genapp.models import PatientNotification


class PatientNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientNotification
        fields = [
            "id",
            "title",
            "body",
            "is_read",
            "created_at",
            "comment",
            "appointment",
            "user_recommendation",
        ]
        read_only_fields = fields
