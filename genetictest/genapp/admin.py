from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User

from .models import (
    UserProfile, Gene, GeneVariant, Recommendation,
    GeneVariantRecommendation, UserGenotype, UserRecommendation,
    Article, SymptomTestItem, Vitamin, GeneVitamin, VitaminGenotypeEffect, Vitamin, VitaminTestResult, DoctorComment, DoctorPatient, DoctorCommentHistory,
    InPersonAppointment,
    PatientNotification,
    PatientSymptomTestSnapshot,
    PatientMythTruthResult,
    MythTruthQuestion,
    GeneticReportUpload,
    GeneSymbolRequest,
    NurseNotification,
    RecommendationReminder,
    PatientVitaminIntake,
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


class RecommendationReminderInline(admin.TabularInline):
    model = RecommendationReminder
    extra = 1
    fields = ("prompt_text", "interval_days", "is_active")


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ('title', 'description', 'category')
    inlines = [RecommendationReminderInline]
admin.site.register(UserProfile)
admin.site.register(Gene)
admin.site.register(GeneVariant)
admin.site.register(GeneVariantRecommendation)
admin.site.register(UserGenotype)
admin.site.register(UserRecommendation)
admin.site.register(Article)


@admin.register(SymptomTestItem)
class SymptomTestItemAdmin(admin.ModelAdmin):
    list_display = ("item_id", "group", "sort_order", "is_active")
    list_filter = ("is_active",)
    search_fields = ("item_id", "label", "group")
    ordering = ("sort_order", "item_id")


@admin.register(PatientSymptomTestSnapshot)
class PatientSymptomTestSnapshotAdmin(admin.ModelAdmin):
    list_display = ("user", "updated_at", "items_count", "vitamins_count")
    search_fields = ("user__username", "user__email")
    raw_id_fields = ("user",)
    readonly_fields = ("updated_at",)

    @admin.display(description="Пунктов")
    def items_count(self, obj):
        return len(obj.selected_item_ids or [])

    @admin.display(description="Витаминов")
    def vitamins_count(self, obj):
        return len(obj.vitamin_ids or [])


@admin.register(PatientMythTruthResult)
class PatientMythTruthResultAdmin(admin.ModelAdmin):
    list_display = ("user", "score", "total", "question_set_signature", "completed_at")
    search_fields = ("user__username", "user__email")
    raw_id_fields = ("user",)
    readonly_fields = ("completed_at",)


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


@admin.register(PatientVitaminIntake)
class PatientVitaminIntakeAdmin(admin.ModelAdmin):
    list_display = ("user", "vitamin", "started_on", "ended_on", "dose_note", "suggested_from", "created_at")
    list_filter = ("vitamin", "started_on", "suggested_from")
    search_fields = ("user__username", "user__email", "vitamin__name", "notes", "dose_note")
    raw_id_fields = ("user", "vitamin")
    readonly_fields = ("created_at", "updated_at")


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


@admin.register(GeneSymbolRequest)
class GeneSymbolRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "symbol", "user", "status", "created_at", "resolved_at")
    list_filter = ("status", "created_at")
    search_fields = ("symbol", "user__username", "raw_input", "comment")
    raw_id_fields = ("user", "resolved_by")