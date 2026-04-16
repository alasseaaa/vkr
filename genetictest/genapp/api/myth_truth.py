from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.models import MythTruthQuestion


class MythTruthQuestionPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = MythTruthQuestion
        fields = ("id", "statement")


class MythTruthSubmitSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.ChoiceField(choices=["myth", "truth"]))


def _active_questions():
    return MythTruthQuestion.objects.filter(is_active=True).order_by("sort_order", "id")


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

        return Response(
            {
                "score": score,
                "total": len(questions),
                "items": items,
            }
        )
