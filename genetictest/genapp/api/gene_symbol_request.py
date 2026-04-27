import re

from django.db import transaction
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.permissions import IsAdminOnly, IsPatientRole
from genapp.models import Gene, GeneSymbolRequest


def normalize_gene_symbol(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    s = re.sub(r"\s+", "", s)
    return s.upper()


SYMBOL_RE = re.compile(r"^[A-Z0-9_\-]{1,32}$")


class PatientGeneSymbolRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneSymbolRequest
        fields = [
            "id",
            "symbol",
            "raw_input",
            "proposed_genotype",
            "comment",
            "status",
            "created_at",
            "admin_note",
        ]
        read_only_fields = [
            "id",
            "symbol",
            "raw_input",
            "status",
            "created_at",
            "admin_note",
        ]


class PatientGeneSymbolRequestCreateSerializer(serializers.Serializer):
    symbol = serializers.CharField(max_length=64)
    proposed_genotype = serializers.CharField(max_length=32, allow_blank=True, default="")
    comment = serializers.CharField(allow_blank=True, default="")

    def validate_symbol(self, value):
        norm = normalize_gene_symbol(value)
        if not norm or not SYMBOL_RE.match(norm):
            raise serializers.ValidationError(
                "Укажите символ гена (латиница, цифры, дефис, до 32 знаков, без пробелов).",
            )
        if Gene.objects.filter(symbol__iexact=norm).exists():
            raise serializers.ValidationError("Такой ген уже есть в справочнике — выберите его в списке.")
        return norm

    def validate(self, data):
        user = self.context["request"].user
        sym = normalize_gene_symbol(data.get("symbol", ""))
        if not sym or not SYMBOL_RE.match(sym):
            return data
        if GeneSymbolRequest.objects.filter(
            user=user,
            symbol=sym,
            status=GeneSymbolRequest.STATUS_PENDING,
        ).exists():
            raise serializers.ValidationError(
                {"non_field_errors": ["Заявка с этим символом уже ожидает рассмотрения."]},
            )
        return data

    @transaction.atomic
    def create(self, validated_data):
        raw_src = (self.initial_data or {}).get("symbol") or ""
        raw = raw_src.strip()[:64] if isinstance(raw_src, str) else str(raw_src)[:64]
        norm = validated_data.get("symbol") or ""
        if isinstance(norm, str):
            norm = norm.strip()[:32]
        pg = validated_data.get("proposed_genotype") or ""
        pg = pg.strip()[:32] if isinstance(pg, str) else ""
        cm = validated_data.get("comment") or ""
        cm = cm.strip() if isinstance(cm, str) else ""
        return GeneSymbolRequest.objects.create(
            user=self.context["request"].user,
            symbol=norm,
            raw_input=raw,
            proposed_genotype=pg,
            comment=cm,
        )


class AdminGeneSymbolRequestListSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source="user.username", read_only=True)
    user_email = serializers.SerializerMethodField()

    class Meta:
        model = GeneSymbolRequest
        fields = [
            "id",
            "user_username",
            "user_email",
            "symbol",
            "raw_input",
            "proposed_genotype",
            "comment",
            "status",
            "created_at",
            "resolved_at",
            "admin_note",
        ]
        read_only_fields = fields

    def get_user_email(self, obj):
        e = getattr(obj.user, "email", "") or ""
        s = e.strip()
        return s or None


class AdminGeneSymbolRequestUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneSymbolRequest
        fields = ["status", "admin_note"]

    def validate_status(self, v):
        allowed = {
            GeneSymbolRequest.STATUS_ADDED,
            GeneSymbolRequest.STATUS_REJECTED,
            GeneSymbolRequest.STATUS_PENDING,
        }
        if v not in allowed:
            raise serializers.ValidationError("Недопустимый статус.")
        return v

    @transaction.atomic
    def update(self, instance, validated_data):
        new_st = validated_data.get("status", instance.status)
        if new_st != instance.status and new_st in (
            GeneSymbolRequest.STATUS_ADDED,
            GeneSymbolRequest.STATUS_REJECTED,
        ):
            instance.resolved_at = timezone.now()
            request = self.context.get("request")
            if request and request.user and request.user.is_authenticated:
                instance.resolved_by = request.user
        elif new_st == GeneSymbolRequest.STATUS_PENDING:
            instance.resolved_at = None
            instance.resolved_by = None
        return super().update(instance, validated_data)


class PatientGeneSymbolRequestListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsPatientRole]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PatientGeneSymbolRequestCreateSerializer
        return PatientGeneSymbolRequestSerializer

    def get_queryset(self):
        return GeneSymbolRequest.objects.filter(user=self.request.user).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        ser = PatientGeneSymbolRequestCreateSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        obj = ser.save()
        out = PatientGeneSymbolRequestSerializer(obj, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class AdminGeneSymbolRequestListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsAdminOnly]
    serializer_class = AdminGeneSymbolRequestListSerializer

    def get_queryset(self):
        qs = GeneSymbolRequest.objects.all().select_related("user").order_by("-created_at")
        st = (self.request.query_params.get("status") or "").strip()
        if st in (
            GeneSymbolRequest.STATUS_PENDING,
            GeneSymbolRequest.STATUS_ADDED,
            GeneSymbolRequest.STATUS_REJECTED,
        ):
            qs = qs.filter(status=st)
        return qs


class AdminGeneSymbolRequestDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOnly]
    queryset = GeneSymbolRequest.objects.select_related("user").all()
    http_method_names = ["get", "head", "options", "patch"]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return AdminGeneSymbolRequestListSerializer
        return AdminGeneSymbolRequestUpdateSerializer

    def partial_update(self, request, *args, **kwargs):
        r = super().partial_update(request, *args, **kwargs)
        if r.status_code == 200:
            obj = self.get_object()
            r.data = AdminGeneSymbolRequestListSerializer(obj, context={"request": request}).data
        return r


class AdminGeneSymbolRequestPendingCountView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOnly]

    def get(self, request):
        n = GeneSymbolRequest.objects.filter(status=GeneSymbolRequest.STATUS_PENDING).count()
        return Response({"pending_count": n})
