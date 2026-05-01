from django.contrib.auth import authenticate, get_user_model, login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone

from genapp.models import UserProfile

User = get_user_model()


def register_user(
    *,
    username: str,
    email: str,
    first_name: str,
    last_name: str,
    patronymic: str,
    password1: str,
    password2: str,
    without_genetic_test: bool = False,
    consent_personal_data: bool = False,
    consent_text_version: str = "1",
):
    if password1 != password2:
        raise DjangoValidationError({"password2": ["Пароли не совпадают."]})

    if User.objects.filter(username=username).exists():
        raise DjangoValidationError({"username": ["Пользователь с таким username уже существует."]})

    if User.objects.filter(email=email).exists():
        raise DjangoValidationError({"email": ["Пользователь с таким email уже существует."]})

    validate_password(password1)

    user = User(
        username=username,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    user.set_password(password1)
    user.save()

    kwargs = {
        "user": user,
        "without_genetic_test": bool(without_genetic_test),
        "patronymic": (patronymic or "").strip(),
    }
    if consent_personal_data:
        kwargs["consent_personal_data_at"] = timezone.now()
        kwargs["consent_text_version"] = (consent_text_version or "1")[:32]
    UserProfile.objects.create(**kwargs)
    return user


def resolve_user_by_email(email: str):
    """
    Вход только по email.
    """
    if not email:
        return None
    try:
        return User.objects.get(email=email)
    except User.DoesNotExist:
        return None


def login_user(request, *, email: str, password: str):
    identifier_user = resolve_user_by_email(email)
    if not identifier_user:
        return None

    user = authenticate(request, username=identifier_user.username, password=password)
    if not user:
        return None

    login(request, user)
    return user

