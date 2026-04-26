from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Q
from rest_framework import serializers, status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.permissions import IsAdminOnly
from genapp.api.article_serializers import ArticleSerializer
from genapp.models import Article, MythTruthQuestion, SymptomTestItem

User = get_user_model()


class MythTruthAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = MythTruthQuestion
        fields = [
            "id",
            "statement",
            "correct_is_truth",
            "explanation",
            "source_url",
            "sort_order",
            "is_active",
        ]


class AdminMythTruthQuestionViewSet(viewsets.ModelViewSet):
    serializer_class = MythTruthAdminSerializer
    permission_classes = [IsAdminOnly]
    queryset = MythTruthQuestion.objects.all().order_by("sort_order", "id")


class AdminArticleViewSet(viewsets.ModelViewSet):
    serializer_class = ArticleSerializer
    permission_classes = [IsAdminOnly]
    queryset = Article.objects.select_related("gene").order_by("-created_at")


class SymptomTestItemAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = SymptomTestItem
        fields = [
            "id",
            "item_id",
            "group",
            "label",
            "gene_symbols",
            "vitamin_substrings",
            "sort_order",
            "is_active",
        ]


def _symptom_public_row(obj: SymptomTestItem) -> dict:
    return {
        "id": obj.item_id,
        "group": obj.group,
        "label": obj.label,
        "geneSymbols": list(obj.gene_symbols or []),
        "vitaminSubstrings": list(obj.vitamin_substrings or []),
    }


class PublicSymptomTestItemListAPIView(APIView):
    """Тест по симптомам: формат как в statическом `symptomTestMap.js`."""

    permission_classes = [AllowAny]

    def get(self, request):
        qs = SymptomTestItem.objects.filter(is_active=True).order_by("sort_order", "item_id")
        return Response([_symptom_public_row(x) for x in qs])


class AdminSymptomTestItemViewSet(viewsets.ModelViewSet):
    serializer_class = SymptomTestItemAdminSerializer
    permission_classes = [IsAdminOnly]
    lookup_field = "item_id"
    lookup_value_regex = "[-a-zA-Z0-9_]+"
    queryset = SymptomTestItem.objects.all().order_by("sort_order", "item_id")


def _user_payload(user):
    has_d = user.groups.filter(name__iexact="doctor").exists()
    has_n = user.groups.filter(name__iexact="nurse").exists()
    clinical = "doctor" if has_d else ("nurse" if has_n else None)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "is_superuser": bool(getattr(user, "is_superuser", False)),
        "is_staff": bool(getattr(user, "is_staff", False)),
        "clinical_role": clinical,
    }


class AdminUserListAPIView(APIView):
    """Поиск пользователей; назначение врач/медсестра — отдельным endpoint."""

    permission_classes = [IsAdminOnly]

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        limit = 100
        try:
            lim = int(request.query_params.get("limit", "100") or 100)
            limit = min(max(lim, 1), 200)
        except (TypeError, ValueError):
            limit = 100
        qs = User.objects.filter(is_active=True).order_by("username")
        if q:
            qs = qs.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
            )
        return Response(
            {
                "results": [_user_payload(u) for u in qs[:limit]],
            },
            status=status.HTTP_200_OK,
        )


class AdminUserClinicalRoleAPIView(APIView):
    """body: { \"clinical_role\": \"nurse\" | \"doctor\" | \"none\" } — группы nurse / doctor (не трогает is_staff / superuser)."""

    permission_classes = [IsAdminOnly]

    def post(self, request, user_id):
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response({"detail": "Пользователь не найден."}, status=status.HTTP_404_NOT_FOUND)
        if target.is_superuser or target.id == request.user.id:
            return Response(
                {"detail": "Суперпользователя и свою роль нельзя менять через эту форму."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        role = (request.data.get("clinical_role") or request.data.get("role") or "").strip().lower()
        if role not in ("nurse", "doctor", "none", ""):
            return Response(
                {"detail": "Нужен clinical_role: nurse, doctor или none."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        g_n, _ = Group.objects.get_or_create(name="nurse")
        g_d, _ = Group.objects.get_or_create(name="doctor")
        for g in list(target.groups.all()):
            if (g.name or "").lower() in ("nurse", "doctor"):
                target.groups.remove(g)
        if role in ("nurse",):
            target.groups.add(g_n)
        elif role in ("doctor",):
            target.groups.add(g_d)
        target.refresh_from_db()
        return Response(_user_payload(target), status=status.HTTP_200_OK)
