import hashlib

from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.permissions import IsPatientOrAdmin, get_user_role
from genapp.models import MythTruthQuestion, PatientMythTruthResult


class MythTruthQuestionPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = MythTruthQuestion
        fields = ("id", "statement")


class MythTruthSubmitSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.ChoiceField(choices=["myth", "truth"]))


def myth_truth_active_question_signature():
    """Подпись набора активных вопросов: множество id (порядок сортировки вопросов не учитывается)."""
    ids = list(MythTruthQuestion.objects.filter(is_active=True).values_list("id", flat=True))
    raw = ",".join(str(i) for i in sorted(ids))
    return hashlib.sha256(raw.encode()).hexdigest()[:48]


def _active_questions():
    return MythTruthQuestion.objects.filter(is_active=True).order_by("sort_order", "id")


def _build_submit_result(questions, answers):
    items = []
    score = 0
    for q in questions:
        key = str(q.id)
        picked = answers[key]
        correct_key = "truth" if q.correct_is_truth else "myth"
        ok = picked == correct_key
        if ok:
            score += 1
        items.append(
            {
                "id": q.id,
                "statement": q.statement,
                "your_answer": picked,
                "correct_answer": correct_key,
                "correct": ok,
                "explanation": q.explanation,
                "source_url": q.source_url or "",
            }
        )
    return {"score": score, "total": len(questions), "items": items}


class MythTruthQuestionListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = _active_questions()
        return Response(MythTruthQuestionPublicSerializer(qs, many=True).data)


class MythTruthSubmitAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = MythTruthSubmitSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        answers = ser.validated_data["answers"]

        questions = list(_active_questions())
        if not questions:
            return Response(
                {"detail": "Вопросы пока не настроены."},
                status=status.HTTP_404_NOT_FOUND,
            )

        expected_ids = {str(q.id) for q in questions}
        got_ids = set(answers.keys())
        if got_ids != expected_ids:
            return Response(
                {
                    "detail": "Нужно ответить на все вопросы текущего набора.",
                    "expected_question_ids": sorted(expected_ids, key=int),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        body = _build_submit_result(questions, answers)

        if request.user.is_authenticated:
            role = get_user_role(request.user)
            if role in ("patient", "admin"):
                PatientMythTruthResult.objects.update_or_create(
                    user=request.user,
                    defaults={
                        "question_set_signature": myth_truth_active_question_signature(),
                        "score": body["score"],
                        "total": body["total"],
                        "result_items": body["items"],
                    },
                )

        return Response(body)


class PatientMythTruthStatusAPIView(APIView):
    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        cur = myth_truth_active_question_signature()
        try:
            r = PatientMythTruthResult.objects.get(user=request.user)
        except PatientMythTruthResult.DoesNotExist:
            return Response({"current_signature": cur, "attempt": None})
        stale = r.question_set_signature != cur
        return Response(
            {
                "current_signature": cur,
                "attempt": {
                    "question_set_signature": r.question_set_signature,
                    "score": r.score,
                    "total": r.total,
                    "completed_at": r.completed_at,
                    "items": r.result_items,
                    "is_stale": stale,
                },
            }
        )
