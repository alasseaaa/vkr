from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.appointment_serializers import (
    InPersonAppointmentCreateSerializer,
    InPersonAppointmentReadSerializer,
    PatientLinkedDoctorSerializer,
)
from genapp.api.permissions import IsDoctor, IsPatientOrAdmin, get_user_role
from genapp.doctor.services import check_doctor_access
from genapp.models import DoctorPatient, InPersonAppointment, PatientNotification
from genapp.users.fio import format_fio_ru


def _doctor_label(user):
    return format_fio_ru(user)


def _notify_appointment(appointment, title, body):
    PatientNotification.objects.create(
        user_id=appointment.patient_id,
        appointment=appointment,
        title=title,
        body=body,
    )


def _parse_datetime_param(value):
    if value is None or value == "":
        return None
    if isinstance(value, str):
        dt = parse_datetime(value)
        if dt is None:
            raise ValueError("Некорректный формат даты.")
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    return value


class PatientLinkedDoctorsAPIView(APIView):
    """Врачи, закреплённые за текущим пациентом (для выбора при записи)."""

    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        if get_user_role(request.user) == "doctor":
            return Response(
                {"detail": "Раздел доступен только пациенту."},
                status=status.HTTP_403_FORBIDDEN,
            )
        links = DoctorPatient.objects.filter(patient=request.user).select_related("doctor__userprofile")
        doctors = [link.doctor for link in links]
        data = PatientLinkedDoctorSerializer(doctors, many=True).data
        return Response(data, status=status.HTTP_200_OK)


class PatientInPersonAppointmentListCreateAPIView(APIView):
    permission_classes = [IsPatientOrAdmin]

    def get(self, request):
        if get_user_role(request.user) == "doctor":
            return Response(
                {"detail": "Раздел доступен только пациенту."},
                status=status.HTTP_403_FORBIDDEN,
            )
        qs = InPersonAppointment.objects.filter(patient=request.user).select_related(
            "doctor__userprofile", "patient__userprofile"
        )
        data = InPersonAppointmentReadSerializer(qs, many=True).data
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        if get_user_role(request.user) == "doctor":
            return Response(
                {"detail": "Раздел доступен только пациенту."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ser = InPersonAppointmentCreateSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        appt = ser.save()
        appt = InPersonAppointment.objects.select_related("doctor__userprofile", "patient__userprofile").get(pk=appt.pk)
        return Response(InPersonAppointmentReadSerializer(appt).data, status=status.HTTP_201_CREATED)


class PatientInPersonAppointmentDetailAPIView(APIView):
    """Отмена заявки пациентом (PATCH с cancel: true)."""

    permission_classes = [IsPatientOrAdmin]

    def patch(self, request, pk):
        if get_user_role(request.user) == "doctor":
            return Response(
                {"detail": "Раздел доступен только пациенту."},
                status=status.HTTP_403_FORBIDDEN,
            )
        appt = get_object_or_404(InPersonAppointment, pk=pk, patient=request.user)
        cancel = request.data.get("cancel")
        if cancel not in (True, "true", 1, "1"):
            return Response(
                {"detail": "Укажите cancel: true для отмены заявки."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if appt.status not in (InPersonAppointment.STATUS_PENDING, InPersonAppointment.STATUS_CONFIRMED):
            return Response(
                {"detail": "Эту заявку нельзя отменить."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        appt.status = InPersonAppointment.STATUS_CANCELLED_BY_PATIENT
        appt.save(update_fields=["status", "updated_at"])
        appt.refresh_from_db()
        return Response(InPersonAppointmentReadSerializer(appt).data, status=status.HTTP_200_OK)


class DoctorInPersonAppointmentListAPIView(APIView):
    permission_classes = [IsDoctor]

    def get(self, request):
        qs = InPersonAppointment.objects.filter(doctor=request.user).select_related(
            "doctor__userprofile", "patient__userprofile"
        )
        st = request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        data = InPersonAppointmentReadSerializer(qs, many=True).data
        return Response(data, status=status.HTTP_200_OK)


class DoctorInPersonAppointmentDetailAPIView(APIView):
    permission_classes = [IsDoctor]

    def patch(self, request, pk):
        appt = get_object_or_404(
            InPersonAppointment.objects.select_related("patient__userprofile", "doctor__userprofile"),
            pk=pk,
            doctor=request.user,
        )
        if not check_doctor_access(request.user.id, appt.patient_id):
            return Response({"detail": "Нет доступа."}, status=status.HTTP_403_FORBIDDEN)

        old_status = appt.status
        terminal = {
            InPersonAppointment.STATUS_DECLINED,
            InPersonAppointment.STATUS_CANCELLED_BY_PATIENT,
            InPersonAppointment.STATUS_CANCELLED_BY_DOCTOR,
        }
        if old_status in terminal:
            return Response({"detail": "Заявка уже закрыта."}, status=status.HTTP_400_BAD_REQUEST)

        new_status = request.data.get("status", old_status)
        doctor_message = request.data.get("doctor_message", serializers.empty)
        confirmed_raw = request.data.get("confirmed_start", serializers.empty)

        if new_status not in dict(InPersonAppointment.STATUS_CHOICES):
            return Response({"detail": "Некорректный статус."}, status=status.HTTP_400_BAD_REQUEST)

        # Смена только текста / времени без смены статуса
        if new_status == old_status:
            if doctor_message is serializers.empty and confirmed_raw is serializers.empty:
                return Response({"detail": "Нет изменений."}, status=status.HTTP_400_BAD_REQUEST)
            if confirmed_raw is not serializers.empty and confirmed_raw is not None:
                if old_status != InPersonAppointment.STATUS_CONFIRMED:
                    return Response(
                        {"detail": "Время приёма можно задать только после подтверждения заявки."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                try:
                    appt.confirmed_start = _parse_datetime_param(confirmed_raw)
                except ValueError as e:
                    return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            if doctor_message is not serializers.empty:
                appt.doctor_message = doctor_message or ""
            update_fields = ["updated_at"]
            if confirmed_raw is not serializers.empty and confirmed_raw is not None:
                update_fields.append("confirmed_start")
            if doctor_message is not serializers.empty:
                update_fields.append("doctor_message")
            appt.save(update_fields=update_fields)
            return Response(InPersonAppointmentReadSerializer(appt).data, status=status.HTTP_200_OK)

        # Допустимые переходы
        allowed = False
        if old_status == InPersonAppointment.STATUS_PENDING:
            allowed = new_status in (
                InPersonAppointment.STATUS_CONFIRMED,
                InPersonAppointment.STATUS_DECLINED,
                InPersonAppointment.STATUS_CANCELLED_BY_DOCTOR,
            )
        elif old_status == InPersonAppointment.STATUS_CONFIRMED:
            allowed = new_status in (InPersonAppointment.STATUS_CANCELLED_BY_DOCTOR,)

        if not allowed:
            return Response({"detail": "Такой переход статуса недопустим."}, status=status.HTTP_400_BAD_REQUEST)

        confirmed_start = appt.confirmed_start
        if new_status == InPersonAppointment.STATUS_CONFIRMED:
            if confirmed_raw is not serializers.empty and confirmed_raw is not None:
                try:
                    confirmed_start = _parse_datetime_param(confirmed_raw)
                except ValueError as e:
                    return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            else:
                confirmed_start = appt.requested_start
        elif new_status in (
            InPersonAppointment.STATUS_DECLINED,
            InPersonAppointment.STATUS_CANCELLED_BY_DOCTOR,
        ):
            confirmed_start = None

        if doctor_message is not serializers.empty:
            appt.doctor_message = doctor_message or ""

        appt.status = new_status
        appt.confirmed_start = confirmed_start
        appt.save(update_fields=["status", "confirmed_start", "doctor_message", "updated_at"])
        appt.refresh_from_db()

        if old_status != new_status:
            dname = _doctor_label(appt.doctor)
            if new_status == InPersonAppointment.STATUS_CONFIRMED:
                when = timezone.localtime(appt.confirmed_start or appt.requested_start)
                when_s = when.strftime("%d.%m.%Y %H:%M") if when else ""
                _notify_appointment(
                    appt,
                    "Очный приём подтверждён",
                    f"{dname} подтвердил встречу на {when_s}. "
                    f"{(appt.doctor_message or '').strip() or 'Подробности уточните у врача.'}",
                )
            elif new_status == InPersonAppointment.STATUS_DECLINED:
                _notify_appointment(
                    appt,
                    "Заявка на приём отклонена",
                    f"{dname}: {(appt.doctor_message or '').strip() or 'Предложено другое время — свяжитесь с клиникой.'}",
                )
            elif new_status == InPersonAppointment.STATUS_CANCELLED_BY_DOCTOR:
                _notify_appointment(
                    appt,
                    "Приём отменён врачом",
                    f"{dname}: {(appt.doctor_message or '').strip() or 'Встреча отменена.'}",
                )

        return Response(InPersonAppointmentReadSerializer(appt).data, status=status.HTTP_200_OK)
