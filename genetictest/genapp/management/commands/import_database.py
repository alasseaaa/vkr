"""
Импорт из JSON, который даёт: python manage.py export_database --format json

  python manage.py import_database exports/snapshot.json
  python manage.py import_database exports/snapshot.json --with-user-data
  python manage.py import_database exports/snapshot.json --dry-run

Справочный контент (гены, статьи, витамины, …) импортируется всегда. Пользователи
и клиника — только с флагом --with-user-data. У импортированных пользователей
пароль сбрасывается; вход — через сброс пароля или admin.
"""

import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from genapp.models import (
    Article,
    DoctorComment,
    DoctorCommentHistory,
    DoctorPatient,
    Gene,
    GeneVariant,
    GeneVariantRecommendation,
    GeneVitamin,
    InPersonAppointment,
    MythTruthQuestion,
    PatientMythTruthResult,
    PatientNotification,
    Recommendation,
    UserGenotype,
    UserProfile,
    UserRecommendation,
    Vitamin,
    VitaminGenotypeEffect,
    VitaminTestResult,
)

User = get_user_model()


def _lookup_rec_id(data, title: str):
    for r in data.get("recommendations") or []:
        if r.get("title") == title:
            return r.get("id")
    return None


class Command(BaseCommand):
    help = "Импорт JSON из export_database (см. доку в начале файла)."

    def add_arguments(self, parser):
        parser.add_argument("json_path", type=str, help="Путь к .json")
        parser.add_argument(
            "--with-user-data",
            action="store_true",
            help="Импорт Users, профилей, анализов, комментариев, заявок, уведомлений.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Только проверить, что JSON читается и структура ok.",
        )

    def handle(self, *args, **options):
        path = Path(options["json_path"])
        if not path.is_file():
            raise CommandError(f"Файл не найден: {path}")
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or "genes" not in data:
            raise CommandError("Ожидается JSON от команды export_database --format json")

        if options["dry_run"]:
            c = {k: len(v) if isinstance(v, list) else 0 for k, v in data.items() if k != "meta" and k != "counts"}
            self.stdout.write(self.style.WARNING("dry-run: в БД ничего не записываю."))
            for k, n in sorted(c.items()):
                if n:
                    self.stdout.write(f"  {k}: {n}")
            return

        with_user = options["with_user_data"]
        with transaction.atomic():
            self._import_reference(data)
            if with_user:
                self._import_users_and_related(data)

        self.stdout.write(self.style.SUCCESS("Готово." + (" Включая пользователей — пароли сброшены." if with_user else "")))

    def _import_reference(self, data):
        n = 0
        for g in data.get("genes") or []:
            Gene.objects.update_or_create(
                pk=g["id"],
                defaults={
                    "symbol": g["symbol"],
                    "full_name": g.get("full_name") or "",
                    "description": g.get("description") or "",
                    "category": g.get("category") or "",
                    "rs_id": g.get("rs_id") or "",
                    "effect_description": g.get("effect_description") or "",
                },
            )
            n += 1
        self.stdout.write(f"  genes: {n}")

        n = 0
        for v in data.get("vitamins") or []:
            Vitamin.objects.update_or_create(
                pk=v["id"],
                defaults={
                    "name": v.get("name") or "",
                    "description": v.get("description") or "",
                    "daily_norm_value": v.get("daily_norm_value"),
                    "upper_limit_value": v.get("upper_limit_value"),
                    "unit": v.get("unit") or "",
                    "unit_test": v.get("unit_test") or "",
                    "category": v.get("category") or "",
                    "ref_min": v.get("ref_min"),
                    "ref_max": v.get("ref_max"),
                },
            )
            n += 1
        self.stdout.write(f"  vitamins: {n}")

        n = 0
        for r in data.get("recommendations") or []:
            Recommendation.objects.update_or_create(
                pk=r["id"],
                defaults={
                    "title": r.get("title") or "",
                    "description": r.get("description") or "",
                    "category": r.get("category") or "",
                },
            )
            n += 1
        self.stdout.write(f"  recommendations: {n}")

        n = 0
        for r in data.get("gene_variants") or []:
            GeneVariant.objects.update_or_create(
                pk=r["id"],
                defaults={
                    "gene_id": r["gene_id"],
                    "genotype": r.get("genotype") or "",
                    "risk_type": r.get("risk_type") or "",
                    "variant_description": r.get("variant_description") or "",
                },
            )
            n += 1
        self.stdout.write(f"  gene_variants: {n}")

        n = 0
        for r in data.get("gene_variant_recommendations") or []:
            GeneVariantRecommendation.objects.update_or_create(
                pk=r["id"],
                defaults={
                    "gene_variant_id": r["gene_variant_id"],
                    "recommendation_id": r["recommendation_id"],
                },
            )
            n += 1
        self.stdout.write(f"  gene_variant_recommendations: {n}")

        n = 0
        for a in data.get("articles") or []:
            Article.objects.update_or_create(
                pk=a["id"],
                defaults={
                    "title": a.get("title") or "",
                    "content": a.get("content") or "",
                    "category": a.get("category") or "",
                    "source_url": a.get("source_url") or "",
                    "author": a.get("author") or "",
                    "gene_id": a.get("gene_id"),
                },
            )
            if a.get("created_at"):
                Article.objects.filter(pk=a["id"]).update(created_at=a["created_at"])
            n += 1
        self.stdout.write(f"  articles: {n}")

        n = 0
        for m in data.get("myth_truth_questions") or []:
            MythTruthQuestion.objects.update_or_create(
                pk=m["id"],
                defaults={
                    "statement": m.get("statement") or "",
                    "correct_is_truth": m.get("correct_is_truth", False),
                    "explanation": m.get("explanation") or "",
                    "source_url": m.get("source_url") or "",
                    "sort_order": m.get("sort_order") or 0,
                    "is_active": m.get("is_active", True),
                },
            )
            n += 1
        self.stdout.write(f"  myth_truth_questions: {n}")

        n = 0
        for r in data.get("gene_vitamins") or []:
            gene = Gene.objects.filter(symbol=r.get("gene")).first()
            vit = Vitamin.objects.filter(name=r.get("vitamin")).first()
            if not gene or not vit:
                self.stdout.write(self.style.WARNING(f"  пропуск gene_vitamin (нет гена/витамина): {r.get('id')}"))
                continue
            eid = r.get("id")
            if eid is not None:
                GeneVitamin.objects.update_or_create(
                    pk=eid,
                    defaults={
                        "gene_id": gene.id,
                        "vitamin_id": vit.id,
                        "effect_description": r.get("effect_description") or "",
                    },
                )
            else:
                GeneVitamin.objects.update_or_create(
                    gene_id=gene.id,
                    vitamin_id=vit.id,
                    defaults={"effect_description": r.get("effect_description") or ""},
                )
            n += 1
        self.stdout.write(f"  gene_vitamins: {n} записей (часть могла быть пропущена)")

        n = 0
        for r in data.get("vitamin_genotype_effects") or []:
            gvid = r.get("gene_variant_id")
            vid = r.get("vitamin_id")
            if not gvid or not vid:
                gvo = _match_gene_variant(r) if not gvid else None
                vito = None
                if r.get("vitamin"):
                    vito = Vitamin.objects.filter(name=r["vitamin"]).first()
                if gvo:
                    gvid = gvo.id
                if vito and not vid:
                    vid = vito.id
            if not gvid or not vid:
                self.stdout.write(
                    self.style.WARNING(f"  пропуск vitamin_genotype_effect id={r.get('id')}: нет gene_variant_id/vitamin_id")
                )
                continue
            VitaminGenotypeEffect.objects.update_or_create(
                pk=r["id"],
                defaults={
                    "gene_variant_id": gvid,
                    "vitamin_id": vid,
                    "impact_level": r.get("impact_level") or "",
                    "effect_text": r.get("effect_text") or "",
                },
            )
            n += 1
        self.stdout.write(f"  vitamin_genotype_effects: {n}")

    def _import_users_and_related(self, data):
        for u in data.get("users") or []:
            email = (u.get("email") or "").strip()
            if email in ("", "[скрыто]"):
                email = f"imported_user_{u['id']}@local.import"
            user, _ = User.objects.update_or_create(
                pk=u["id"],
                defaults={
                    "username": u.get("username") or f"user_{u['id']}",
                    "email": email[:250],
                },
            )
            user.set_unusable_password()
            if u.get("is_active") is not None:
                user.is_active = u["is_active"]
            if u.get("is_staff") is not None:
                user.is_staff = u["is_staff"]
            user.save()

        for p in data.get("user_profiles") or []:
            uid = p.get("user_id")
            if not uid or not User.objects.filter(pk=uid).exists():
                continue
            UserProfile.objects.update_or_create(
                user_id=uid,
                defaults={
                    "height": p.get("height"),
                    "weight": p.get("weight"),
                    "activity_level": p.get("activity_level") or "",
                    "diet_preferences": p.get("diet_preferences") or "",
                    "goals_text": p.get("goals_text") or "",
                    "without_genetic_test": p.get("without_genetic_test", False),
                    "patronymic": p.get("patronymic") or "",
                    "birth_date": p.get("birth_date") or None,
                    "gender": p.get("gender") or "",
                },
            )

        for g in data.get("user_genotypes") or []:
            if not User.objects.filter(pk=g.get("user_id")).exists():
                continue
            UserGenotype.objects.update_or_create(
                pk=g["id"],
                defaults={
                    "user_id": g["user_id"],
                    "gene_variant_id": g["gene_variant_id"],
                },
            )
            if g.get("created_at"):
                UserGenotype.objects.filter(pk=g["id"]).update(created_at=g["created_at"])

        for r in data.get("user_recommendations") or []:
            rid = r.get("recommendation_id") or _lookup_rec_id(data, r.get("recommendation", ""))
            if not rid:
                continue
            UserRecommendation.objects.update_or_create(
                pk=r["id"],
                defaults={
                    "user_id": r["user_id"],
                    "recommendation_id": rid,
                    "status": r.get("status") or "new",
                },
            )
            if r.get("created_at"):
                UserRecommendation.objects.filter(pk=r["id"]).update(created_at=r["created_at"])

        for t in data.get("vitamin_test_results") or []:
            uid = t.get("user_id")
            vid = t.get("vitamin_id")
            if not vid and t.get("vitamin"):
                vid = Vitamin.objects.filter(name=t["vitamin"]).values_list("id", flat=True).first()
            if not uid or not vid:
                continue
            VitaminTestResult.objects.update_or_create(
                pk=t["id"],
                defaults={
                    "user_id": uid,
                    "vitamin_id": vid,
                    "test_value": t["test_value"],
                    "test_date": t.get("test_date"),
                },
            )

        for d in data.get("doctor_patients") or []:
            if not User.objects.filter(pk=d.get("doctor_id")).exists():
                continue
            if not User.objects.filter(pk=d.get("patient_id")).exists():
                continue
            DoctorPatient.objects.update_or_create(
                pk=d["id"],
                defaults={"doctor_id": d["doctor_id"], "patient_id": d["patient_id"]},
            )
            if d.get("created_at"):
                DoctorPatient.objects.filter(pk=d["id"]).update(created_at=d["created_at"])

        for c in data.get("doctor_comments") or []:
            if not c.get("doctor_id") or not c.get("patient_id"):
                continue
            DoctorComment.objects.update_or_create(
                pk=c["id"],
                defaults={
                    "doctor_id": c["doctor_id"],
                    "patient_id": c["patient_id"],
                    "genotype_id": c.get("genotype_id"),
                    "vitamin_test_id": c.get("vitamin_test_id"),
                    "text": c.get("text") or "",
                    "status": c.get("status") or "draft",
                },
            )
            if c.get("created_at"):
                DoctorComment.objects.filter(pk=c["id"]).update(created_at=c["created_at"])

        for h in data.get("doctor_comment_history") or []:
            eid = h.get("edited_by_id")
            if eid and not User.objects.filter(pk=eid).exists():
                continue
            if not DoctorComment.objects.filter(pk=h.get("comment_id")).exists():
                continue
            DoctorCommentHistory.objects.update_or_create(
                pk=h["id"],
                defaults={
                    "comment_id": h["comment_id"],
                    "edited_by_id": eid,
                    "previous_text": h.get("previous_text") or "",
                    "previous_status": h.get("previous_status") or "draft",
                    "previous_genotype_id": h.get("previous_genotype_id"),
                    "previous_vitamin_test_id": h.get("previous_vitamin_test_id"),
                },
            )
            if h.get("edited_at"):
                DoctorCommentHistory.objects.filter(pk=h["id"]).update(edited_at=h["edited_at"])

        for a in data.get("in_person_appointments") or []:
            InPersonAppointment.objects.update_or_create(
                pk=a["id"],
                defaults={
                    "patient_id": a["patient_id"],
                    "doctor_id": a["doctor_id"],
                    "requested_start": a["requested_start"],
                    "confirmed_start": a.get("confirmed_start"),
                    "patient_note": a.get("patient_note") or "",
                    "doctor_message": a.get("doctor_message") or "",
                    "status": a.get("status") or "pending",
                },
            )

        for n in data.get("patient_notifications") or []:
            PatientNotification.objects.update_or_create(
                pk=n["id"],
                defaults={
                    "user_id": n["user_id"],
                    "comment_id": n.get("comment_id"),
                    "appointment_id": n.get("appointment_id"),
                    "title": n.get("title") or "",
                    "body": n.get("body") or "",
                    "is_read": n.get("is_read", False),
                },
            )

        for x in data.get("patient_myth_truth_results") or []:
            uid = x.get("user_id")
            if not uid or not User.objects.filter(pk=uid).exists():
                continue
            obj, _ = PatientMythTruthResult.objects.update_or_create(
                user_id=uid,
                defaults={
                    "question_set_signature": x.get("question_set_signature") or "",
                    "score": x.get("score") or 0,
                    "total": x.get("total") or 0,
                    "result_items": x.get("result_items") or [],
                },
            )
            if x.get("completed_at"):
                PatientMythTruthResult.objects.filter(pk=obj.pk).update(completed_at=x["completed_at"])
        self.stdout.write("  user-related tables: ok")


def _match_gene_variant(r):
    """Старые выгрузки без id — мягкое сопоставление (может не сработать)."""
    s = (r.get("gene_variant") or "").strip()
    if not s:
        return None
    parts = s.split()
    if len(parts) >= 2:
        sym, gt = parts[0], parts[1]
        return GeneVariant.objects.filter(gene__symbol=sym, genotype=gt).first()
    return None
