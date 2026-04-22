from django.contrib.auth import get_user_model
from rest_framework import serializers

from genapp.models import UserProfile
from genapp.users.services import register_user

User = get_user_model()


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=30)
    last_name = serializers.CharField(max_length=30)
    password1 = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)
    without_genetic_test = serializers.BooleanField(required=False, default=False)
    consent_personal_data = serializers.BooleanField(required=True)

    def validate(self, attrs):
        if attrs.get("password1") != attrs.get("password2"):
            raise serializers.ValidationError({"password2": ["Пароли не совпадают."]})
        return attrs

    def validate_consent_personal_data(self, value):
        if not value:
            raise serializers.ValidationError(
                "Необходимо согласие на обработку персональных (в т.ч. медицинских) данных."
            )
        return value

    def create(self, validated_data):
        data = {**validated_data}
        without_genetic_test = bool(data.pop("without_genetic_test", False))
        data.pop("consent_personal_data", None)
        user = register_user(
            username=data["username"],
            email=data["email"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            password1=data["password1"],
            password2=data["password2"],
            without_genetic_test=without_genetic_test,
            consent_personal_data=True,
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "height",
            "weight",
            "gender",
            "birth_date",
            "activity_level",
            "diet_preferences",
            "goals_text",
            "without_genetic_test",
            "consent_personal_data_at",
            "consent_text_version",
            "updated_at",
        ]
        read_only_fields = ["updated_at", "consent_personal_data_at", "consent_text_version"]


class PatientOwnProfileUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    height = serializers.IntegerField(required=False, allow_null=True, min_value=40, max_value=280)
    weight = serializers.IntegerField(required=False, allow_null=True, min_value=2, max_value=500)
    gender = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=16)
    birth_date = serializers.DateField(required=False, allow_null=True)
    activity_level = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=16)
    diet_preferences = serializers.CharField(required=False, allow_blank=True)
    goals_text = serializers.CharField(required=False, allow_blank=True)
    without_genetic_test = serializers.BooleanField(required=False)
    consent_personal_data = serializers.BooleanField(required=False)

    def validate_gender(self, value):
        if value in (None, ""):
            return ""
        if value not in ("male", "female"):
            raise serializers.ValidationError("Укажите male или female.")
        return value

    def validate_activity_level(self, value):
        if value in (None, ""):
            return ""
        if value not in ("low", "medium", "high"):
            raise serializers.ValidationError("Некорректный уровень активности.")
        return value


class PatientProfileSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "profile"]

    def get_profile(self, obj):
        try:
            profile = obj.userprofile
        except UserProfile.DoesNotExist:
            return None
        return UserProfileSerializer(profile).data

