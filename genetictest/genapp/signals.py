from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from genapp.models import DoctorComment, MythTruthQuestion, PatientMythTruthResult, PatientNotification
from genapp.users.fio import format_fio_ru


@receiver(pre_save, sender=DoctorComment)
def _doctor_comment_cache_status(sender, instance, **kwargs):
    if not instance.pk:
        instance._prev_comment_status = None
        return
    try:
        old = DoctorComment.objects.get(pk=instance.pk)
        instance._prev_comment_status = old.status
    except DoctorComment.DoesNotExist:
        instance._prev_comment_status = None


def _should_create_patient_notification(instance, created):
    if instance.status != "published":
        return False
    prev = getattr(instance, "_prev_comment_status", None)
    if created:
        return True
    return prev is not None and prev != "published"


def _notification_title_body(comment):
    doctor = comment.doctor
    dname = format_fio_ru(doctor)
    if comment.genotype_id:
        title = "Комментарий к генетическому маркеру"
    elif comment.vitamin_test_id:
        title = "Комментарий к анализу витамина"
    else:
        title = "Комментарий врача"
    preview = (comment.text or "").strip()[:240]
    body = f"{dname}: {preview}" if preview else f"Сообщение от врача {dname}"
    return title, body


@receiver(post_save, sender=DoctorComment)
def notify_patient_on_published_comment(sender, instance, created, **kwargs):
    if not _should_create_patient_notification(instance, created):
        return
    title, body = _notification_title_body(instance)
    PatientNotification.objects.create(
        user_id=instance.patient_id,
        comment=instance,
        title=title,
        body=body,
    )


MYTH_TRUTH_UPDATED_TITLE = "Миф или правда: обновлён тест"


def _notify_patients_myth_truth_stale():
    from genapp.api.myth_truth import myth_truth_active_question_signature

    cur = myth_truth_active_question_signature()
    stale_qs = PatientMythTruthResult.objects.exclude(question_set_signature=cur).select_related("user")
    for pr in stale_qs:
        u = pr.user
        PatientNotification.objects.filter(user=u, title=MYTH_TRUTH_UPDATED_TITLE, is_read=False).delete()
        PatientNotification.objects.create(
            user=u,
            title=MYTH_TRUTH_UPDATED_TITLE,
            body="В тест добавлены или изменены вопросы. Рекомендуем пройти его заново.",
        )


@receiver([post_save, post_delete], sender=MythTruthQuestion)
def notify_patients_myth_truth_questions_changed(sender, **kwargs):
    """Один проход уведомлений на транзакцию (несколько save подряд — один on_commit)."""

    conn = transaction.get_connection()
    if getattr(conn, "_myth_truth_notify_scheduled", False):
        return
    conn._myth_truth_notify_scheduled = True

    def _clear_and_notify():
        conn._myth_truth_notify_scheduled = False
        _notify_patients_myth_truth_stale()

    transaction.on_commit(_clear_and_notify)
