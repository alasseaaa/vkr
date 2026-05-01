from rest_framework import serializers

from genapp.models import Recommendation


class RecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recommendation
        fields = ["id", "title", "description", "category"]
        read_only_fields = ["id"]

