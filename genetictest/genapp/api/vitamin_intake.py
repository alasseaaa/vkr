"""Курсы приёма витаминов: multipart + выдача фото только владельцу."""
from __future__ import annotations

import mimetypes
import os

from django.http import FileResponse
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from genapp.api.permissions import IsPatientOrAdmin, get_user_role
from genapp.models import PatientVitaminIntake

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_CT = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"},
)


def _validate_intake_image(f) -> None:
    if not f:
        return
    if getattr(f, "size", None) and f.size > MAX_IMAGE_BYTES:
        raise serializers.ValidationError("Фото не больше 5 МБ.")
    ct = (getattr(f, "content_type", None) or "").split(";")[0].strip().lower()
    if ct and ct not in ALLOWED_IMAGE_CT:
        raise serializers.ValidationError("Допустимы JPEG, PNG, WebP или GIF.")


class PatientVitaminIntakeSerializer(serializers.ModelSerializer):
    vitamin_name = serializers.CharField(source="vitamin.name", read_only=True)
    vitamin_unit_test = serializers.CharField(source="vitamin.unit_test", read_only=True)
    photo_url = serializers.SerializerMethodField()
    is_active_course = serializers.SerializerMethodField()

    class Meta:
        model = PatientVitaminIntake
        extra_kwargs = {"photo": {"write_only": True}}
        fields = [
            "id",
            "vitamin",
            "vitamin_name",
            "vitamin_unit_test",
            "started_on",
            "ended_on",
            "dose_note",
            "notes",
            "suggested_from",
            "photo",
            "photo_url",
            "is_active_course",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vitamin_name",
            "vitamin_unit_test",
            "photo_url",
            "is_active_course",
            "created_at",
            "updated_at",
        ]

    def get_photo_url(self, obj):
        if not obj.photo or not obj.photo.name:
            return None
        request = self.context.get("request")
        path = f"/api/patient/vitamin-intake/{obj.pk}/photo/"
        return request.build_absolute_uri(path) if request else path

    def get_is_active_course(self, obj):
        if obj.ended_on is None:
            return True
        return obj.ended_on >= timezone.now().date()

    def validate(self, attrs):
        inst = self.instance
        started = attrs.get("started_on")
        ended = attrs.get("ended_on")
        if started is None and inst is not None:
            started = inst.started_on
        if ended is None and inst is not None and "ended_on" not in attrs:
            ended = inst.ended_on
        if started and ended and ended < started:
            raise serializers.ValidationError(
                {"ended_on": "Дата окончания не может быть раньше даты начала."}
            )
        return attrs

    def validate_photo(self, value):
        _validate_intake_image(value)
        return value


class PatientVitaminIntakeViewSet(viewsets.ModelViewSet):
    serializer_class = PatientVitaminIntakeSerializer
    permission_classes = [IsPatientOrAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "head", "options", "post", "put", "patch", "delete"]

    def get_queryset(self):
        role = get_user_role(self.request.user)
        qs = PatientVitaminIntake.objects.select_related("vitamin").all()
        if role != "admin":
            qs = qs.filter(user=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["get"], url_path="photo")
    def photo(self, request, pk=None):
        obj = self.get_object()
        if not obj.photo or not obj.photo.name:
            return Response({"detail": "Фото не прикреплено."}, status=status.HTTP_404_NOT_FOUND)
        fh = obj.photo.open("rb")
        name = os.path.basename(obj.photo.name) or "photo.jpg"
        content_type, _ = mimetypes.guess_type(name)
        if not content_type or content_type not in ALLOWED_IMAGE_CT:
            content_type = "application/octet-stream"
        response = FileResponse(fh, as_attachment=False, content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="{name}"'
        return response

    def perform_destroy(self, instance):
        f = instance.photo
        if f and getattr(f, "name", None):
            f.delete(save=False)
        instance.delete()
