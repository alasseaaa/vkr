from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User

from .models import (
    UserProfile, Gene, GeneVariant, Recommendation,
    GeneVariantRecommendation, UserGenotype, UserRecommendation,
    Article, Vitamin, GeneVitamin, VitaminGenotypeEffect, Vitamin, VitaminTestResult, DoctorComment, DoctorPatient, DoctorCommentHistory,
    InPersonAppointment,
    PatientNotification,
    MythTruthQuestion,
    GeneticReportUpload,
    NurseNotification,
)


# Явная карточка пользователя: блок «Группы» с двумя колонками (доступно / выбрано).
# Роль врача: группа «doctor». Роль медсестры: «nurse».
try:
    admin.site.unregister(User)
except admin.sites.NotRegistered:
    pass


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    filter_horizontal = ("groups", "user_permissions")
    list_display = ("username", "email", "first_name", "last_name", "is_staff", "is_active")
    list_filter = ("is_staff", "is_superuser", "is_active", "groups")


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ('title', 'description', 'category')
admin.site.register(UserProfile)
admin.site.register(Gene)
admin.site.register(GeneVariant)
admin.site.register(GeneVariantRecommendation)
admin.site.register(UserGenotype)
admin.site.register(UserRecommendation)
admin.site.register(Article)


@admin.register(MythTruthQuestion)
class MythTruthQuestionAdmin(admin.ModelAdmin):
    list_display = ("short_statement", "correct_is_truth", "sort_order", "is_active")
    list_filter = ("is_active", "correct_is_truth")
    search_fields = ("statement", "explanation")
    ordering = ("sort_order", "id")

    @admin.display(description="Утверждение")
    def short_statement(self, obj):
        s = (obj.statement or "").strip()
        return (s[:70] + "…") if len(s) > 70 else s or "—"
admin.site.register(GeneVitamin)
admin.site.register(VitaminGenotypeEffect)
admin.site.register(Vitamin)
@admin.register(VitaminTestResult)
class VitaminTestResultAdmin(admin.ModelAdmin):
    list_filter = ('vitamin', 'test_date', 'user')
    search_fields = ('user__username', 'vitamin__name')
admin.site.register(DoctorPatient)


@admin.register(InPersonAppointment)
class InPersonAppointmentAdmin(admin.ModelAdmin):
    list_display = ("id", "patient", "doctor", "status", "requested_start", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("patient__username", "doctor__username")
    raw_id_fields = ("patient", "doctor")
admin.site.register(DoctorComment)
admin.site.register(DoctorCommentHistory)
admin.site.register(PatientNotification)


@admin.register(GeneticReportUpload)
class GeneticReportUploadAdmin(admin.ModelAdmin):
    list_display = ("id", "patient", "status", "created_at", "processed_by")
    list_filter = ("status", "created_at")
    search_fields = ("patient__username",)
    raw_id_fields = ("patient", "processed_by")


@admin.register(NurseNotification)
class NurseNotificationAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "upload", "is_read", "created_at")
    list_filter = ("is_read", "created_at")
    raw_id_fields = ("user", "upload")