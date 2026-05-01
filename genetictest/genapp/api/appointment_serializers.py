from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from genapp.models import DoctorPatient, InPersonAppointment
from genapp.users.fio import format_fio_ru

User = get_user_model()


class PatientLinkedDoctorSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "full_name"]

    def get_full_name(self, obj):
        return format_fio_ru(obj)


class InPersonAppointmentReadSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()

    class Meta:
        model = InPersonAppointment
        fields = [
            "id",
            "patient",
            "doctor",
            "doctor_name",
            "patient_name",
            "requested_start",
            "confirmed_start",
            "patient_note",
            "doctor_message",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_doctor_name(self, obj):
        return format_fio_ru(obj.doctor)

    def get_patient_name(self, obj):
        return format_fio_ru(obj.patient)


class InPersonAppointmentCreateSerializer(serializers.ModelSerializer):
    doctor = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)

    class Meta:
        model = InPersonAppointment
        fields = ["doctor", "requested_start", "patient_note"]

    def validate_requested_start(self, value):
        if timezone.is_naive(value):
            value = timezone.make_aware(value, timezone.get_current_timezone())
        if value < timezone.now():
            raise serializers.ValidationError("Выберите дату и время в будущем.")
        return value

    def validate(self, attrs):
        patient = self.context["request"].user
        links = (
            DoctorPatient.objects.filter(patient=patient)
            .select_related("doctor")
            .order_by("created_at", "id")
        )
        if not links.exists():
            raise serializers.ValidationError({"doctor": "У вас нет закреплённого врача."})
        # В заявке всегда используется основной закрепленный врач (первый по назначению).
        attrs["doctor"] = links.first().doctor
        return attrs

    def create(self, validated_data):
        return InPersonAppointment.objects.create(patient=self.context["request"].user, **validated_data)
