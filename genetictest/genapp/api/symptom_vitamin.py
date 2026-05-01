from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.patient_catalog import VitaminChoiceSerializer
from genapp.api.permissions import IsPatientOrAdmin, get_user_role
from genapp.models import PatientSymptomTestSnapshot, Vitamin, VitaminTestResult
from genapp.vitamins.suggested import (
    merge_suggested_vitamin_ids,
    vitamin_ids_from_genetics,
    vitamin_scores_for_symptom_items,
)

User = get_user_model()


class PatientSymptomTestSubmitAPIView(APIView):
    """Сохранить отмеченные пункты теста и вычисленные ID витаминов для подсказок анализов."""

    permission_classes = [IsPatientOrAdmin]

    def post(self, request):
        if get_user_role(request.user) not in ("patient", "admin"):
            return Response(
                {"detail": "Сохранение результата теста доступно только пациенту."},
                status=status.HTTP_403_FORBIDDEN,
            )
        raw = request.data.get("selected_item_ids")
        if not isinstance(raw, list):
            return Response(
                {"detail": "Ожидается поле selected_item_ids (массив строк item_id)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ids = [str(x).strip() for x in raw if str(x).strip()]
        scored = vitamin_scores_for_symptom_items(ids)
        vit_ids = [vid for vid, _ in scored]

        PatientSymptomTestSnapshot.objects.update_or_create(
            user=request.user,
            defaults={
                "selected_item_ids": ids,
                "vitamin_ids": vit_ids,
            },
        )
        return Response(
            {
                "ok": True,
                "selected_count": len(ids),
                "vitamin_ids": vit_ids,
            }
        )


class PatientSuggestedVitaminsAPIView(APIView):
    """Подсказки по витаминам (симптомы + генетика). Позиции с уже внесённым анализом не исключаются — для наблюдения и повторного внесения."""

    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        if get_user_role(request.user) not in ("patient", "admin"):
            return Response(
                {"detail": "Подсказки доступны только пациенту."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = request.user

        snap = getattr(user, "symptom_test_snapshot", None)
        symptom_ordered: list[int] = list(snap.vitamin_ids) if snap and snap.vitamin_ids else []
        genetics_ids = vitamin_ids_from_genetics(user)

        score_by_id = dict(vitamin_scores_for_symptom_items(snap.selected_item_ids if snap else []))

        merged = merge_suggested_vitamin_ids(symptom_ordered, genetics_ids)
        if not merged:
            return Response(
                {
                    "suggestions": [],
                    "symptom_test_updated_at": snap.updated_at.isoformat() if snap else None,
                }
            )

        symptom_set = set(symptom_ordered)
        genetics_set = set(genetics_ids)
        tested_ids = set(
            VitaminTestResult.objects.filter(user=user).values_list("vitamin_id", flat=True)
        )

        vitamins_by_id = {v.id: v for v in Vitamin.objects.filter(id__in=merged)}
        suggestions = []
        for vid in merged:
            v = vitamins_by_id.get(vid)
            if not v:
                continue
            sources = []
            if vid in symptom_set:
                sources.append("symptoms")
            if vid in genetics_set:
                sources.append("genetics")
            suggestions.append(
                {
                    "vitamin": VitaminChoiceSerializer(v).data,
                    "sources": sources,
                    "symptom_match_score": score_by_id.get(vid, 0),
                    "has_test": vid in tested_ids,
                }
            )

        return Response(
            {
                "suggestions": suggestions,
                "symptom_test_updated_at": snap.updated_at.isoformat() if snap else None,
            }
        )
