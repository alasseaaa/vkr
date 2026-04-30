from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.patient_notifications import PatientNotificationSerializer
from genapp.api.permissions import IsAdminOnly, IsDoctor, IsPatientOrAdmin, IsPatientRole, get_user_role
from genapp.doctor.services import check_doctor_access
from genapp.api.article_serializers import ArticleSerializer
from genapp.models import (
    Article,
    DoctorComment,
    DoctorCommentHistory,
    DoctorPatient,
    PatientNotification,
    Gene,
    GeneVariant,
    Recommendation,
    UserGenotype,
    UserProfile,
    VitaminTestResult,
)
from genapp.genetics.serializers import (
    GeneSerializer,
    GeneVariantSerializer,
    UserGenotypeSerializer,
)
from genapp.recommendations.serializers import RecommendationSerializer
from genapp.recommendations.services import (
    ensure_due_recommendation_reminders,
    get_interpretation,
    get_user_recommendations,
)
from genapp.reports.patient_report_pdf import build_patient_report_pdf
from genapp.doctor.activity import get_doctor_patient_activity
from genapp.doctor.serializers import (
    DoctorCommentSerializer,
    DoctorPatientListSerializer,
    PatientDoctorCommentReadSerializer,
)
from genapp.users.serializers import (
    LoginSerializer,
    PatientOwnProfileUpdateSerializer,
    PatientProfileSerializer,
    RegisterSerializer,
    UserProfileSerializer,
)
from genapp.vitamins.serializers import VitaminTestResultSerializer
from genapp.users.services import login_user as login_user_service


User = get_user_model()


class PublicArticleViewSet(ReadOnlyModelViewSet):
    """Статьи — доступны без авторизации."""

    serializer_class = ArticleSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = Article.objects.select_related("gene").order_by("-created_at")
        q = (self.request.query_params.get("q") or "").strip()
        cat = (self.request.query_params.get("category") or "").strip()
        if cat:
            qs = qs.filter(category=cat)
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(content__icontains=q))
        return qs


class RegisterAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"id": user.id, "username": user.username, "email": user.email},
            status=status.HTTP_201_CREATED,
        )


class LoginAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = login_user_service(
            request,
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if not user:
            return Response(
                {"detail": "Неверные учетные данные."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        role = get_user_role(user)
        needs_consent = False
        if role in ("patient", "admin"):
            prof, _ = UserProfile.objects.get_or_create(user=user)
            needs_consent = prof.consent_personal_data_at is None

        return Response(
            {
                "id": user.id,
                "username": user.username,
                "role": role,
                "needs_consent": bool(needs_consent),
            },
            status=status.HTTP_200_OK,
        )


class MeAPIView(APIView):
    """
    Текущий пользователь (Basic / сессия DRF) — роль с сервера.
    Нужен SPA, чтобы обновлять auth_role в localStorage после смены групп в админке.
    """

    def get(self, request):
        u = request.user
        if not u.is_authenticated:
            return Response({"detail": "Требуется вход."}, status=status.HTTP_401_UNAUTHORIZED)
        return Response(
            {
                "id": u.id,
                "username": u.username,
                "first_name": u.first_name or "",
                "last_name": u.last_name or "",
                "role": get_user_role(u),
            }
        )


class PatientGenotypeViewSet(viewsets.ModelViewSet):
    serializer_class = UserGenotypeSerializer
    permission_classes = [IsPatientOrAdmin]

    def get_serializer_context(self):
        c = super().get_serializer_context()
        c["genotype_user"] = self.request.user
        return c

    def get_queryset(self):
        role = get_user_role(self.request.user)
        qs = UserGenotype.objects.select_related("gene_variant", "gene_variant__gene").all()
        if role != "admin":
            qs = qs.filter(user=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PatientVitaminTestViewSet(viewsets.ModelViewSet):
    serializer_class = VitaminTestResultSerializer
    permission_classes = [IsPatientOrAdmin]

    def get_queryset(self):
        role = get_user_role(self.request.user)
        qs = VitaminTestResult.objects.select_related("vitamin").all()
        if role != "admin":
            qs = qs.filter(user=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class PatientInterpretationAPIView(APIView):
    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        target_user = request.user
        if get_user_role(request.user) == "admin":
            user_id = request.query_params.get("user_id")
            if user_id:
                target_user = get_object_or_404(User, pk=user_id)
        return Response(get_interpretation(target_user), status=status.HTTP_200_OK)


class PatientRecommendationsAPIView(APIView):
    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        target_user = request.user
        if get_user_role(request.user) == "admin":
            user_id = request.query_params.get("user_id")
            if user_id:
                target_user = get_object_or_404(User, pk=user_id)
        return Response(get_user_recommendations(target_user), status=status.HTTP_200_OK)


class PatientReportPDFAPIView(APIView):
    """PDF: рекомендации + опубликованные комментарии врача."""

    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        if get_user_role(request.user) == "doctor":
            return Response(
                {"detail": "Скачивание отчёта доступно только пациенту."},
                status=status.HTTP_403_FORBIDDEN,
            )
        target_user = request.user
        if get_user_role(request.user) == "admin":
            user_id = request.query_params.get("user_id")
            if user_id:
                target_user = get_object_or_404(User, pk=user_id)
        try:
            pdf_bytes = build_patient_report_pdf(target_user)
        except RuntimeError as e:
            return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        filename = f"otchet_{target_user.id}_{timezone.now().strftime('%Y%m%d')}.pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class PatientOwnProfileAPIView(APIView):
    """Профиль текущего пользователя (пациент / админ)."""

    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        if get_user_role(request.user) == "doctor":
            return Response(
                {"detail": "Профиль пациента в этом разделе недоступен для роли врача."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = request.user
        profile, _ = UserProfile.objects.get_or_create(user=user)
        data = UserProfileSerializer(profile).data
        payload = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            **data,
            # Явно для UI (на случай кэша старого бандла, без ключа в ответе):
            "has_personal_data_consent": bool(profile.consent_personal_data_at),
        }
        return Response(payload)

    def patch(self, request):
        if get_user_role(request.user) == "doctor":
            return Response(
                {"detail": "Профиль пациента в этом разделе недоступен для роли врача."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = PatientOwnProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = request.user
        if "first_name" in data:
            user.first_name = data["first_name"]
        if "last_name" in data:
            user.last_name = data["last_name"]
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        for field in (
            "height",
            "weight",
            "gender",
            "birth_date",
            "activity_level",
            "diet_preferences",
            "goals_text",
            "without_genetic_test",
        ):
            if field in data:
                setattr(profile, field, data[field])
        if data.get("consent_personal_data") is True and not profile.consent_personal_data_at:
            profile.consent_personal_data_at = timezone.now()
            if not (profile.consent_text_version or "").strip():
                profile.consent_text_version = "1"
        profile.save()

        return self.get(request)


class AdminGeneViewSet(viewsets.ModelViewSet):
    serializer_class = GeneSerializer
    permission_classes = [IsAdminOnly]

    def get_queryset(self):
        return Gene.objects.all()


class AdminGeneVariantViewSet(viewsets.ModelViewSet):
    serializer_class = GeneVariantSerializer
    permission_classes = [IsAdminOnly]

    def get_queryset(self):
        return GeneVariant.objects.select_related("gene").all()


class AdminRecommendationViewSet(viewsets.ModelViewSet):
    serializer_class = RecommendationSerializer
    permission_classes = [IsAdminOnly]

    def get_queryset(self):
        return Recommendation.objects.all()


def _query_bool(param):
    if param is None:
        return None
    s = str(param).strip().lower()
    if s in ("1", "true", "yes", "on"):
        return True
    if s in ("0", "false", "no", "off", ""):
        return False
    return None


class DoctorPatientsListAPIView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        patient_ids = DoctorPatient.objects.filter(doctor=request.user).values_list("patient_id", flat=True)
        qs = (
            User.objects.filter(id__in=patient_ids)
            .annotate(
                genotypes_count=Count("usergenotype", distinct=True),
                vitamin_tests_count=Count("vitamin_tests", distinct=True),
            )
            .order_by("last_name", "first_name", "username")
        )

        if _query_bool(request.query_params.get("no_genotypes")) is True:
            qs = qs.filter(genotypes_count=0)

        if _query_bool(request.query_params.get("no_vitamin_tests")) is True:
            qs = qs.filter(vitamin_tests_count=0)

        idle = _parse_optional_int(request.query_params.get("inactive_days"))
        if idle is not None and idle > 0:
            threshold = timezone.now() - timedelta(days=idle)
            qs = qs.filter(Q(last_login__isnull=True) | Q(last_login__lt=threshold))

        if _query_bool(request.query_params.get("incomplete_profile")) is True:
            no_profile = ~Exists(UserProfile.objects.filter(user_id=OuterRef("pk")))
            incomplete_fields = Exists(
                UserProfile.objects.filter(user_id=OuterRef("pk")).filter(
                    Q(height__isnull=True)
                    | Q(weight__isnull=True)
                    | Q(gender="")
                    | Q(birth_date__isnull=True)
                )
            )
            qs = qs.filter(no_profile | incomplete_fields)

        data = DoctorPatientListSerializer(qs, many=True).data
        return Response(data, status=status.HTTP_200_OK)


class DoctorActivityFeedAPIView(APIView):
    """Лента последних событий по всем пациентам врача."""

    permission_classes = [IsDoctor]

    def get(self, request):
        lim = _parse_optional_int(request.query_params.get("limit")) or 50
        lim = min(max(lim, 1), 100)
        data = get_doctor_patient_activity(request.user, limit=lim)
        return Response(data, status=status.HTTP_200_OK)


class DoctorPatientProfileAPIView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request, patient_id: int):
        if not check_doctor_access(request.user.id, patient_id):
            return Response({"detail": "Нет доступа к этому пациенту."}, status=status.HTTP_403_FORBIDDEN)

        patient = get_object_or_404(User, pk=patient_id)

        genotypes = (
            UserGenotype.objects.filter(user_id=patient_id)
            .select_related("gene_variant", "gene_variant__gene")
            .all()
        )
        vitamin_tests = VitaminTestResult.objects.filter(user_id=patient_id).select_related("vitamin").all()

        payload = {
            "patient": PatientProfileSerializer(patient).data,
            "genotypes": UserGenotypeSerializer(genotypes, many=True, context={"request": request}).data,
            "vitamin_tests": VitaminTestResultSerializer(vitamin_tests, many=True).data,
        }
        return Response(payload, status=status.HTTP_200_OK)


def _parse_optional_int(param):
    if param is None or param == "":
        return None
    try:
        return int(param)
    except (TypeError, ValueError):
        return None


class DoctorCommentListAPIView(APIView):
    """
    GET /api/v1/comments/
    Пациент — только свои опубликованные комментарии (кроме удалённых).
    Врач — комментарии закреплённого пациента (черновик + опубликован), без удалённых.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)
        if role not in ("patient", "doctor"):
            return Response({"detail": "Недостаточно прав."}, status=status.HTTP_403_FORBIDDEN)

        patient_id_raw = request.query_params.get("patient_id")
        genetic_result_id = _parse_optional_int(request.query_params.get("genetic_result_id"))
        vitamin_reading_id = _parse_optional_int(request.query_params.get("vitamin_reading_id"))

        if genetic_result_id is not None and vitamin_reading_id is not None:
            return Response(
                {"detail": "Укажите только один из параметров: genetic_result_id или vitamin_reading_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_patient_id = None

        if role == "patient":
            target_patient_id = request.user.id
            if patient_id_raw is not None:
                pid = _parse_optional_int(patient_id_raw)
                if pid is not None and pid != request.user.id:
                    return Response({"detail": "Нет доступа."}, status=status.HTTP_403_FORBIDDEN)

            if genetic_result_id is not None:
                if not UserGenotype.objects.filter(id=genetic_result_id, user_id=request.user.id).exists():
                    return Response({"detail": "Маркер не найден."}, status=status.HTTP_404_NOT_FOUND)

            if vitamin_reading_id is not None:
                if not VitaminTestResult.objects.filter(id=vitamin_reading_id, user_id=request.user.id).exists():
                    return Response({"detail": "Анализ не найден."}, status=status.HTTP_404_NOT_FOUND)

        else:  # doctor
            if genetic_result_id is not None:
                ug = UserGenotype.objects.filter(id=genetic_result_id).select_related("gene_variant__gene").first()
                if ug is None:
                    return Response({"detail": "Маркер не найден."}, status=status.HTTP_404_NOT_FOUND)
                target_patient_id = ug.user_id
                if not check_doctor_access(request.user.id, target_patient_id):
                    return Response({"detail": "Нет доступа к этому пациенту."}, status=status.HTTP_403_FORBIDDEN)
            elif vitamin_reading_id is not None:
                vt = VitaminTestResult.objects.filter(id=vitamin_reading_id).first()
                if vt is None:
                    return Response({"detail": "Анализ не найден."}, status=status.HTTP_404_NOT_FOUND)
                target_patient_id = vt.user_id
                if not check_doctor_access(request.user.id, target_patient_id):
                    return Response({"detail": "Нет доступа к этому пациенту."}, status=status.HTTP_403_FORBIDDEN)
            else:
                pid = _parse_optional_int(patient_id_raw)
                if pid is None:
                    return Response({"detail": "Укажите patient_id."}, status=status.HTTP_400_BAD_REQUEST)
                if not check_doctor_access(request.user.id, pid):
                    return Response({"detail": "Нет доступа к этому пациенту."}, status=status.HTTP_403_FORBIDDEN)
                target_patient_id = pid

        history_exists = DoctorCommentHistory.objects.filter(comment_id=OuterRef("pk"))
        qs = (
            DoctorComment.objects.filter(patient_id=target_patient_id)
            .select_related("doctor", "genotype__gene_variant__gene", "vitamin_test__vitamin")
            .annotate(_was_edited=Exists(history_exists))
        )

        if role == "patient":
            qs = qs.filter(status="published")
        else:
            qs = qs.exclude(status="deleted")

        if genetic_result_id is not None:
            qs = qs.filter(genotype_id=genetic_result_id)
        if vitamin_reading_id is not None:
            qs = qs.filter(vitamin_test_id=vitamin_reading_id)

        qs = qs.order_by("-created_at")
        data = PatientDoctorCommentReadSerializer(qs, many=True).data
        return Response(data, status=status.HTTP_200_OK)


class DoctorCommentCreateAPIView(APIView):
    permission_classes = [IsDoctor]

    def post(self, request, patient_id: int):
        if not check_doctor_access(request.user.id, patient_id):
            return Response({"detail": "Нет доступа к этому пациенту."}, status=status.HTTP_403_FORBIDDEN)

        serializer = DoctorCommentSerializer(
            data=request.data,
            context={"request": request, "patient_id": patient_id},
        )
        serializer.is_valid(raise_exception=True)
        comment = serializer.save()
        return Response(DoctorCommentSerializer(comment, context={"request": request, "patient_id": patient_id}).data)


class DoctorConclusionCreateAPIView(APIView):
    permission_classes = [IsDoctor]

    def post(self, request, patient_id: int):
        if not check_doctor_access(request.user.id, patient_id):
            return Response({"detail": "Нет доступа к этому пациенту."}, status=status.HTTP_403_FORBIDDEN)

        payload = {"text": request.data.get("text"), "status": "published", "genotype": None, "vitamin_test": None}
        serializer = DoctorCommentSerializer(
            data=payload,
            context={"request": request, "patient_id": patient_id},
        )
        serializer.is_valid(raise_exception=True)
        comment = serializer.save()
        return Response(DoctorCommentSerializer(comment, context={"request": request, "patient_id": patient_id}).data)


class DoctorCommentUpdateAPIView(APIView):
    permission_classes = [IsDoctor]

    def get_object(self, request, comment_id: int):
        comment = get_object_or_404(
            DoctorComment.objects.select_related("patient").all(),
            pk=comment_id,
            doctor_id=request.user.id,
        )
        if not check_doctor_access(request.user.id, comment.patient_id):
            return None
        return comment

    def put(self, request, comment_id: int):
        comment = self.get_object(request, comment_id)
        if comment is None:
            return Response({"detail": "Нет доступа."}, status=status.HTTP_403_FORBIDDEN)

        serializer = DoctorCommentSerializer(
            comment,
            data=request.data,
            partial=False,
            context={"request": request, "patient_id": comment.patient_id},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, comment_id: int):
        comment = self.get_object(request, comment_id)
        if comment is None:
            return Response({"detail": "Нет доступа."}, status=status.HTTP_403_FORBIDDEN)

        serializer = DoctorCommentSerializer(
            comment,
            data=request.data,
            partial=True,
            context={"request": request, "patient_id": comment.patient_id},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class PatientNotificationsUnreadAPIView(APIView):
    permission_classes = [IsPatientRole]

    def get(self, request):
        ensure_due_recommendation_reminders(request.user)
        unread_qs = PatientNotification.objects.filter(user=request.user, is_read=False).order_by("-created_at")
        unread_count = unread_qs.count()
        items = unread_qs[:50]
        return Response(
            {
                "unread_count": unread_count,
                "items": PatientNotificationSerializer(items, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class PatientNotificationsMarkReadAPIView(APIView):
    permission_classes = [IsPatientRole]

    def post(self, request):
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"detail": "Укажите ids — непустой список идентификаторов."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            id_list = [int(x) for x in ids]
        except (TypeError, ValueError):
            return Response({"detail": "Некорректный формат ids."}, status=status.HTTP_400_BAD_REQUEST)
        PatientNotification.objects.filter(user=request.user, pk__in=id_list).update(is_read=True)
        return Response({"ok": True}, status=status.HTTP_200_OK)

