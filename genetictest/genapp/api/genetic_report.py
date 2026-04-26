"""Загрузка PDF в разделе генов, уведомления для медсестер, ввод генотипов в профиль пациента."""
from __future__ import annotations

import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.mixins import (
    CreateModelMixin,
    DestroyModelMixin,
    ListModelMixin,
    RetrieveModelMixin,
)
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.permissions import IsNurse, IsPatientOrAdmin, get_user_role
from genapp.genetics.serializers import UserGenotypeSerializer
from genapp.models import GeneticReportUpload, NurseNotification, UserGenotype

User = get_user_model()

MAX_PDF_BYTES = 5 * 1024 * 1024


def _notify_nurses_on_upload(upload: GeneticReportUpload) -> None:
    g = Group.objects.filter(name__iexact="nurse").first()
    if not g:
        return
    for u in g.user_set.all():
        NurseNotification.objects.get_or_create(
            user=u, upload=upload, defaults={}
        )


def nurse_target_patient(user_id: int) -> User:
    u = get_object_or_404(User, pk=user_id)
    if get_user_role(u) != "patient":
        raise PermissionDenied("Генотипы вносятся только в профили пациентов.")
    return u


def _validate_upload_file(f) -> None:
    if not f:
        raise serializers.ValidationError("Прикрепите файл PDF.")
    name = (f.name or "").lower()
    if not name.endswith(".pdf"):
        raise serializers.ValidationError("Нужен файл в формате PDF.")
    if getattr(f, "size", 0) and f.size > MAX_PDF_BYTES:
        raise serializers.ValidationError("Максимальный размер файла — 5 МБ.")


class PatientGeneticReportListSerializer(serializers.ModelSerializer):
    """file_url — прямой MEDIA (legacy); для просмотра в SPA лучше GET .../file/ с авторизацией."""

    file_url = serializers.SerializerMethodField()
    can_download = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    file_api_url = serializers.SerializerMethodField()

    class Meta:
        model = GeneticReportUpload
        fields = [
            "id",
            "file_url",
            "file_api_url",
            "status",
            "admin_note",
            "created_at",
            "updated_at",
            "can_download",
            "can_delete",
        ]
        read_only_fields = fields

    def get_file_url(self, obj):
        if not obj.file:
            return None
        u = obj.file.url
        request = self.context.get("request")
        return request.build_absolute_uri(u) if request else u

    def get_file_api_url(self, obj):
        if not obj.file or not obj.pk:
            return None
        request = self.context.get("request")
        path = f"/api/patient/genetic-reports/{obj.pk}/file/"
        if request:
            return request.build_absolute_uri(path)
        return path

    def get_can_download(self, obj):
        return bool(obj.file)

    def get_can_delete(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or not obj.pk:
            return False
        role = get_user_role(request.user)
        if role == "admin":
            return True
        if role == "patient" and obj.patient_id == request.user.id:
            return obj.status != GeneticReportUpload.STATUS_DONE
        return False


class PatientGeneticReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneticReportUpload
        fields = ("file",)

    def validate_file(self, f):
        _validate_upload_file(f)
        return f


class NurseGeneticReportSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    patient_id = serializers.IntegerField(read_only=True)
    patient_username = serializers.CharField(source="patient.username", read_only=True)
    processed_by_username = serializers.SerializerMethodField()

    class Meta:
        model = GeneticReportUpload
        fields = [
            "id",
            "patient_id",
            "patient_username",
            "file_url",
            "status",
            "admin_note",
            "created_at",
            "updated_at",
            "processed_by",
            "processed_by_username",
        ]
        read_only_fields = [
            "id",
            "patient_id",
            "patient_username",
            "file_url",
            "created_at",
            "updated_at",
            "processed_by",
            "processed_by_username",
        ]

    def get_processed_by_username(self, obj):
        u = obj.processed_by
        return u.get_username() if u else None

    def get_file_url(self, obj):
        if not obj.file:
            return None
        u = obj.file.url
        request = self.context.get("request")
        return request.build_absolute_uri(u) if request else u

class PatientGeneticReportViewSet(
    ListModelMixin,
    CreateModelMixin,
    RetrieveModelMixin,
    DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsPatientOrAdmin]
    http_method_names = ["get", "head", "options", "post", "delete"]

    def get_queryset(self):
        role = get_user_role(self.request.user)
        qs = GeneticReportUpload.objects.select_related("patient", "processed_by")
        if role == "admin":
            return qs
        return qs.filter(patient=self.request.user)

    def get_serializer_class(self):
        if self.action == "create":
            return PatientGeneticReportCreateSerializer
        return PatientGeneticReportListSerializer

    def perform_destroy(self, instance: GeneticReportUpload) -> None:
        role = get_user_role(self.request.user)
        if role == "patient" and instance.status == GeneticReportUpload.STATUS_DONE:
            raise PermissionDenied("Нельзя удалить документ после обработки медсестрой.")
        f = instance.file
        if f and getattr(f, "name", None):
            f.delete(save=False)
        instance.delete()

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request, pk=None):
        """Скачивание/просмотр PDF только владельцу (или админу) — с Basic/session auth."""
        obj = self.get_object()
        if not obj.file or not obj.file.name:
            return Response({"detail": "Файл не найден."}, status=status.HTTP_404_NOT_FOUND)
        fh = obj.file.open("rb")
        name = os.path.basename(obj.file.name) or "document.pdf"
        if not str(name).lower().endswith(".pdf"):
            name = f"{name}.pdf"
        response = FileResponse(
            fh,
            as_attachment=False,
            content_type="application/pdf",
        )
        response["Content-Disposition"] = f'inline; filename="{name}"'
        return response

    def perform_create(self, serializer):
        u = self.request.user
        serializer.save(
            patient=u,
            status=GeneticReportUpload.STATUS_PENDING,
        )
        _notify_nurses_on_upload(serializer.instance)

    def create(self, request, *args, **kwargs):
        r = get_user_role(request.user)
        if r not in ("patient", "admin"):
            return Response(
                {
                    "detail": "PDF могут прикреплять учётки пациентов "
                    "(или сотрудник-админ для демо от своего имени)."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        f = request.FILES.get("file")
        if not f:
            return Response({"file": ["Прикрепите PDF."]}, status=status.HTTP_400_BAD_REQUEST)
        _validate_upload_file(f)
        ser = PatientGeneticReportCreateSerializer(data={"file": f}, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        self.perform_create(ser)
        out = PatientGeneticReportListSerializer(ser.instance, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)


class NurseGeneticReportListAPIView(APIView):
    permission_classes = [IsNurse]

    def get(self, request):
        st = (request.query_params.get("status") or "").strip()
        qs = GeneticReportUpload.objects.select_related("patient", "processed_by").order_by("-created_at")
        if st:
            qs = qs.filter(status=st)
        return Response(
            NurseGeneticReportSerializer(qs, many=True, context={"request": request}).data
        )


class NurseGeneticReportDetailAPIView(APIView):
    permission_classes = [IsNurse]

    def get(self, request, upload_id: int):
        o = get_object_or_404(
            GeneticReportUpload.objects.select_related("patient", "processed_by"), pk=upload_id
        )
        return Response(
            NurseGeneticReportSerializer(o, context={"request": request}).data, status=status.HTTP_200_OK
        )

    def patch(self, request, upload_id: int):
        o = get_object_or_404(
            GeneticReportUpload.objects.select_related("patient", "processed_by"), pk=upload_id
        )
        if "status" in request.data:
            o.status = request.data.get("status")
        if "admin_note" in request.data:
            o.admin_note = request.data.get("admin_note") or ""
        if o.status in (GeneticReportUpload.STATUS_DONE, GeneticReportUpload.STATUS_REJECTED):
            o.processed_by = request.user
        o.save()
        o.refresh_from_db()
        return Response(
            NurseGeneticReportSerializer(o, context={"request": request}).data, status=status.HTTP_200_OK
        )


class NurseNotificationsUnreadAPIView(APIView):
    permission_classes = [IsNurse]

    def get(self, request):
        qs = NurseNotification.objects.filter(user=request.user, is_read=False).select_related(
            "upload", "upload__patient"
        )[:200]
        unread = NurseNotification.objects.filter(user=request.user, is_read=False).count()
        items = [
            {
                "id": n.id,
                "is_read": n.is_read,
                "upload_id": n.upload_id,
                "status": n.upload.status,
                "patient_id": n.upload.patient_id,
                "patient_username": n.upload.patient.username if n.upload.patient else "",
                "created_at": n.upload.created_at,
            }
            for n in qs
        ]
        return Response({"unread_count": unread, "items": items})


class NurseNotificationsMarkReadAPIView(APIView):
    permission_classes = [IsNurse]

    def post(self, request):
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"detail": "Укажите ids — непустой список."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            id_list = [int(x) for x in ids]
        except (TypeError, ValueError):
            return Response({"detail": "Некорректный формат ids."}, status=status.HTTP_400_BAD_REQUEST)
        NurseNotification.objects.filter(user=request.user, pk__in=id_list).update(is_read=True)
        return Response({"ok": True}, status=status.HTTP_200_OK)


class NursePatientSummaryAPIView(APIView):
    permission_classes = [IsNurse]

    def get(self, request, patient_id: int):
        p = nurse_target_patient(patient_id)
        return Response(
            {
                "id": p.id,
                "username": p.username,
                "first_name": p.first_name or "",
                "last_name": p.last_name or "",
            }
        )


class NursePatientGenotypeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsNurse]
    serializer_class = UserGenotypeSerializer
    http_method_names = ["get", "head", "options", "post", "put", "patch", "delete"]

    def get_target_patient(self):
        if not hasattr(self, "_target_patient_obj"):
            self._target_patient_obj = nurse_target_patient(self.kwargs["patient_id"])
        return self._target_patient_obj

    def get_serializer_context(self):
        c = super().get_serializer_context()
        c["genotype_user"] = self.get_target_patient()
        return c

    def get_queryset(self):
        return (
            UserGenotype.objects.filter(user_id=self.kwargs["patient_id"])
            .select_related("gene_variant", "gene_variant__gene")
            .order_by("id")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.get_target_patient())
