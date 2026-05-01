from django.urls import path

from . import views

urlpatterns = [
    path("", views.home_view, name="home"),
    path("privacy-policy/", views.privacy_policy_view, name="privacy_policy"),
    path("register/", views.spa_hash_redirect, {"fragment": "register"}, name="register"),
    path("login/", views.spa_hash_redirect, {"fragment": "login"}, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("app/", views.spa_index_view, name="spa_index"),
    path("profile/", views.spa_hash_redirect, {"fragment": "dashboard"}, name="profile"),
    path("genotype-input/", views.spa_hash_redirect, {"fragment": "genotypes"}, name="genotype_input"),
    path("recommendations/", views.spa_hash_redirect, {"fragment": "recommendations"}, name="recommendations"),
    path("passport/", views.spa_hash_redirect, {"fragment": "passport"}, name="passport"),
    path("articles/", views.articles_view, name="articles"),
    path("vitamin-tests/", views.spa_hash_redirect, {"fragment": "vitamins"}, name="vitamin_tests"),
    path("vitamins/", views.spa_hash_redirect, {"fragment": "vitamins"}, name="vitamins_spa"),
    path(
        "patient/appointments/",
        views.spa_hash_redirect,
        {"fragment": "appointments"},
        name="patient_appointments",
    ),
    path(
        "appointments/",
        views.spa_hash_redirect,
        {"fragment": "appointments"},
        name="appointments_spa",
    ),
    path(
        "vitamin-tests/delete/<int:pk>/",
        views.spa_hash_redirect,
        {"fragment": "vitamins"},
        name="vitamin_test_delete",
    ),
]
