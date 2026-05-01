from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.permissions import IsPatientOrAdmin
from genapp.models import UserRecommendation


class PushUserSettingsAPIView(APIView):
    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        rows = (
            UserRecommendation.objects.select_related("recommendation")
            .filter(user=request.user)
            .order_by("-id")
        )
        data = [
            {
                "user_recommendation_id": r.id,
                "recommendation_id": r.recommendation_id,
                "title": r.recommendation.title,
                "is_habit_tracking_enabled": bool(r.is_habit_tracking_enabled),
                "last_reminder_sent_at": r.last_reminder_sent_at,
            }
            for r in rows
        ]
        return Response({"items": data}, status=status.HTTP_200_OK)

    def post(self, request):
        user_rec_id = request.data.get("user_recommendation_id")
        if not user_rec_id:
            return Response({"detail": "Требуется user_recommendation_id."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            ur = UserRecommendation.objects.get(pk=int(user_rec_id), user=request.user)
        except Exception:
            return Response({"detail": "Рекомендация не найдена."}, status=status.HTTP_404_NOT_FOUND)

        if "is_habit_tracking_enabled" in request.data:
            ur.is_habit_tracking_enabled = bool(request.data.get("is_habit_tracking_enabled"))
        if "status" in request.data:
            incoming = str(request.data.get("status") or "").strip().lower()
            if incoming in {"new", "seen", "applied", "dismissed"}:
                ur.status = incoming
        ur.save()
        return Response(
            {
                "user_recommendation_id": ur.id,
                "is_habit_tracking_enabled": ur.is_habit_tracking_enabled,
                "status": ur.status,
            },
            status=status.HTTP_200_OK,
        )


