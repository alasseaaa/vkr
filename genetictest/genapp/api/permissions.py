from rest_framework.permissions import BasePermission

from genapp.doctor.services import check_doctor_access
from genapp.models import DoctorPatient


def get_user_role(user):
    """
    Роль пользователя для API.

    Приоритет:
    - superuser: admin
    - doctor: группа `doctor` или привязка DoctorPatient
    - nurse: группа `nurse` (в т.ч. при is_staff — иначе SPA даст «лишние» пункты меню)
    - staff без клинических групп: admin
    - иначе patient
    """
    if not user or not getattr(user, "is_authenticated", False):
        return None

    if getattr(user, "is_superuser", False):
        return "admin"

    if user.groups.filter(name__iexact="doctor").exists():
        return "doctor"

    if DoctorPatient.objects.filter(doctor=user).exists():
        return "doctor"

    if user.groups.filter(name__iexact="nurse").exists():
        return "nurse"

    if getattr(user, "is_staff", False):
        return "admin"

    return "patient"


class RolePermission(BasePermission):
    """
    Базовый permission по роли.

    Используется как подкласс с заданным class attribute `required_roles`.
    """

    required_roles = set()

    def has_permission(self, request, view):
        role = get_user_role(request.user)
        if not role:
            return False
        return role in self.required_roles


class IsPatientOrAdmin(RolePermission):
    required_roles = {"patient", "admin"}


class IsPatientNurseOrAdmin(RolePermission):
    """Справочники генов/вариантов/витаминов: пациент, медсестра (ввод в чужой профиль), админ."""

    required_roles = {"patient", "nurse", "admin"}


class IsPatientRole(RolePermission):
    """Только пациент (не врач и не staff-админ)."""

    required_roles = {"patient"}


class IsDoctor(RolePermission):
    required_roles = {"doctor"}


class IsNurse(RolePermission):
    required_roles = {"nurse"}


class IsAdminOnly(RolePermission):
    required_roles = {"admin"}


class IsPatientOwner(BasePermission):
    """
    Для объектов, которые принадлежат пользователю через поле `user`.
    """

    def has_object_permission(self, request, view, obj):
        owner = getattr(obj, "user", None)
        if owner is None:
            return False
        return owner_id_equal(owner, request.user)


def owner_id_equal(owner, user):
    return getattr(owner, "id", None) == getattr(user, "id", None)


class IsDoctorCommentAuthor(BasePermission):
    def has_object_permission(self, request, view, obj):
        if getattr(obj, "doctor_id", None) != request.user.id:
            return False
        # Дополнительно проверяем, что врач имеет доступ к пациенту.
        return check_doctor_access(request.user.id, obj.patient_id)

