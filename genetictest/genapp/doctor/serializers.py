from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from genapp.models import DoctorComment, DoctorCommentHistory, UserGenotype, VitaminTestResult, UserProfile
from genapp.users.serializers import UserProfileSerializer

User = get_user_model()


class DoctorPatientListSerializer(serializers.ModelSerializer):
    """Список пациентов врача с краткой статистикой для фильтров и таблицы."""

    profile = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()
    genotypes_count = serializers.IntegerField(read_only=True)
    vitamin_tests_count = serializers.IntegerField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "profile",
            "genotypes_count",
            "vitamin_tests_count",
            "last_login",
        ]

    def get_full_name(self, obj):
        from genapp.users.fio import format_fio_ru

        return format_fio_ru(obj)

    def get_profile(self, obj):
        try:
            profile = obj.userprofile
        except UserProfile.DoesNotExist:
            return None
        return UserProfileSerializer(profile).data


class DoctorCommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorComment
        fields = [
            "id",
            "genotype",
            "vitamin_test",
            "text",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        # Комментарий может относиться к одному из типов.
        genotype = attrs.get("genotype", getattr(self.instance, "genotype", None))
        vitamin_test = attrs.get("vitamin_test", getattr(self.instance, "vitamin_test", None))

        if genotype and vitamin_test:
            raise serializers.ValidationError("Комментарий может относиться только к одному объекту: генотипу или анализу витамина.")

        patient_id = self.context.get("patient_id")
        if patient_id is None:
            return attrs

        # Проверяем принадлежность связанного объекта пациенту (чтобы врач не комментировал чужие данные).
        if genotype and genotype.user_id != patient_id:
            raise serializers.ValidationError("Выбранный генотип не принадлежит указанному пациенту.")

        if vitamin_test and vitamin_test.user_id != patient_id:
            raise serializers.ValidationError("Выбранный анализ витамина не принадлежит указанному пациенту.")

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        patient_id = self.context["patient_id"]
        doctor = request.user

        return DoctorComment.objects.create(
            doctor=doctor,
            patient_id=patient_id,
            **validated_data,
        )

    def update(self, instance, validated_data):
        request = self.context["request"]

        old_text = instance.text
        old_status = instance.status
        old_genotype_id = instance.genotype_id
        old_vitamin_test_id = instance.vitamin_test_id

        new_text = validated_data.get("text", old_text)
        new_status = validated_data.get("status", old_status)
        new_genotype = validated_data.get("genotype", instance.genotype)
        new_vitamin_test = validated_data.get("vitamin_test", instance.vitamin_test)
        new_genotype_id = getattr(new_genotype, "id", None) if new_genotype else None
        new_vitamin_test_id = getattr(new_vitamin_test, "id", None) if new_vitamin_test else None

        # Сохраняем историю до фактического применения изменений.
        if (
            new_text != old_text
            or new_status != old_status
            or new_genotype_id != old_genotype_id
            or new_vitamin_test_id != old_vitamin_test_id
        ):
            DoctorCommentHistory.objects.create(
                comment=instance,
                edited_by=request.user,
                previous_text=old_text,
                previous_status=old_status,
                previous_genotype_id=old_genotype_id,
                previous_vitamin_test_id=old_vitamin_test_id,
            )

        return super().update(instance, validated_data)


class DoctorCommentHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorCommentHistory
        fields = [
            "id",
            "previous_text",
            "previous_status",
            "previous_genotype_id",
            "previous_vitamin_test_id",
            "edited_at",
            "edited_by_id",
        ]


class PatientDoctorCommentReadSerializer(serializers.ModelSerializer):
    """Чтение комментариев пациентом (и список для врача). Поля по ТЗ: genetic_result_id / vitamin_reading_id."""

    doctor_name = serializers.SerializerMethodField()
    created_at = serializers.SerializerMethodField()
    genetic_result_id = serializers.IntegerField(source="genotype_id", read_only=True)
    vitamin_reading_id = serializers.IntegerField(source="vitamin_test_id", read_only=True)
    was_edited = serializers.SerializerMethodField()
    gene_symbol = serializers.SerializerMethodField()
    vitamin_name = serializers.SerializerMethodField()

    class Meta:
        model = DoctorComment
        fields = [
            "id",
            "doctor_name",
            "text",
            "created_at",
            "status",
            "genetic_result_id",
            "vitamin_reading_id",
            "was_edited",
            "gene_symbol",
            "vitamin_name",
        ]

    def get_doctor_name(self, obj):
        from genapp.users.fio import format_fio_ru

        return format_fio_ru(obj.doctor)

    def get_created_at(self, obj):
        dt = timezone.localtime(obj.created_at)
        return dt.strftime("%d.%m.%Y")

    def get_was_edited(self, obj):
        if hasattr(obj, "_was_edited"):
            return bool(obj._was_edited)
        return obj.history.exists()

    def get_gene_symbol(self, obj):
        if not obj.genotype_id:
            return None
        gv = getattr(obj, "genotype", None)
        if gv is None:
            return None
        gene = getattr(getattr(gv, "gene_variant", None), "gene", None)
        return getattr(gene, "symbol", None)

    def get_vitamin_name(self, obj):
        if not obj.vitamin_test_id:
            return None
        vt = getattr(obj, "vitamin_test", None)
        if vt is None:
            return None
        vit = getattr(vt, "vitamin", None)
        return getattr(vit, "name", None)

