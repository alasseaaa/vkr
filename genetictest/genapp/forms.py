from django import forms
from .models import UserProfile, UserGenotype, Vitamin, VitaminTestResult
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
import datetime


class CustomUserCreationForm(UserCreationForm):
    email = forms.EmailField(required=True, label="Email")
    first_name = forms.CharField(max_length=30, required=True, label="Имя")
    last_name = forms.CharField(max_length=30, required=True, label="Фамилия")
    patronymic = forms.CharField(max_length=64, min_length=2, required=True, label="Отчество")
    
    class Meta:
        model = User
        fields = ("username", "email", "first_name", "last_name", "password1", "password2")
    
    def clean_email(self):
        email = self.cleaned_data['email']
        if User.objects.filter(email=email).exists():
            raise ValidationError("Пользователь с таким email уже существует")
        return email
    
    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        user.first_name = self.cleaned_data["first_name"]
        user.last_name = self.cleaned_data["last_name"]
        if commit:
            user.save()
        return user

class CustomAuthenticationForm(AuthenticationForm):
    username = forms.CharField(
        label="Email",
        widget=forms.EmailInput(attrs={'autofocus': True, 'placeholder': 'you@example.com'})
    )
    
    def clean_username(self):
        email = self.cleaned_data.get('username')
        if '@' not in email:
            raise ValidationError("Вход возможен только по email")
        try:
            user = User.objects.get(email=email)
            return user.username
        except User.DoesNotExist:
            raise ValidationError("Пользователь с таким email не найден")

class UserProfileForm(forms.ModelForm):
    class Meta:
        model = UserProfile
        fields = [
            "patronymic",
            "height",
            "weight",
            "activity_level",
            "diet_preferences",
            "goals_text",
            "birth_date",
            "gender",
        ]
        widgets = {
            "birth_date": forms.DateInput(attrs={"type": "date"}),
            "diet_preferences": forms.Textarea(attrs={"rows": 3}),
            "goals_text": forms.Textarea(attrs={"rows": 3}),
        }

    def clean_patronymic(self):
        v = (self.cleaned_data.get("patronymic") or "").strip()
        if len(v) < 2:
            raise ValidationError("Укажите отчество (не менее 2 символов).")
        return v


class UserGenotypeForm(forms.ModelForm):
    class Meta:
        model = UserGenotype
        fields = ['gene_variant']


class VitaminTestResultForm(forms.ModelForm):
    class Meta:
        model = VitaminTestResult
        fields = ['vitamin', 'test_value', 'test_date']
        widgets = {
            'test_date': forms.DateInput(attrs={'type': 'date'}),
        }
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Сортируем витамины по имени
        self.fields['vitamin'].queryset = Vitamin.objects.all().order_by('name')
        # Добавляем placeholder с единицами измерения
        self.fields['test_value'].widget.attrs['placeholder'] = 'Результат анализа'