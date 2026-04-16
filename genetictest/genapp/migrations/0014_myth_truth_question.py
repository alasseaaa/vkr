from django.db import migrations, models


def seed_myth_truth(apps, schema_editor):
    MythTruthQuestion = apps.get_model("genapp", "MythTruthQuestion")
    if MythTruthQuestion.objects.exists():
        return
    rows = [
        dict(
            statement="Взрослому человеку достаточно постоянно спать по 4–5 часов в сутки, если «привык».",
            correct_is_truth=False,
            explanation=(
                "Потребность во сне индивидуальна, но хронический недосып связан с рисками для здоровья и когниции. "
                "Если сна мало, лучше обсудить режим и самочувствие с врачом, а не опираться на ощущение «привык»."
            ),
            source_url="",
            sort_order=10,
            is_active=True,
        ),
        dict(
            statement="Умеренная регулярная физическая активность обычно полезна для сердца и сосудов, если нет противопоказаний.",
            correct_is_truth=True,
            explanation=(
                "Рекомендации ВОЗ и национальные гайдылайны сходятся: регулярное движение умеренной интенсивности поддерживает "
                "сердечно-сосудистую систему. Перед сменой режима при заболеваниях стоит согласовать нагрузку с врачом."
            ),
            source_url="https://www.who.int/news-room/fact-sheets/detail/physical-activity",
            sort_order=20,
            is_active=True,
        ),
        dict(
            statement="Чем больше приёмов пищи в сутки при той же калорийности, тем «быстрее» обязательно станет метаболизм.",
            correct_is_truth=False,
            explanation=(
                "Суточная энергия и состав рациона важнее числа приёмов: эффект на метаболизм не сводится к одному правилу "
                "для всех. Режим питания удобнее подбирать с учётом самочувствия и рекомендаций специалиста."
            ),
            source_url="",
            sort_order=30,
            is_active=True,
        ),
        dict(
            statement="Витамин D организм может частично синтезировать при умеренном пребывании на солнце (кожа летом), если нет противопоказаний.",
            correct_is_truth=True,
            explanation=(
                "Ультрафиолет B действительно запускает синтез витамина D в коже; зимой и при малой инсоляции часто не хватает. "
                "Дефицит и дозировки лучше обсуждать с врачом по анализам, а не назначать самостоятельно."
            ),
            source_url="",
            sort_order=40,
            is_active=True,
        ),
        dict(
            statement="Яркий экран смартфона непосредственно перед сном может ухудшать засыпание у многих людей.",
            correct_is_truth=True,
            explanation=(
                "Свет высокой яркости и близкое расстояние могут сдвигать время засыпания. Практичный шаг — тусклый режим, "
                "меньше стимулов за час до сна и стабильный распорядок."
            ),
            source_url="",
            sort_order=50,
            is_active=True,
        ),
        dict(
            statement="Хронический стресс не может влиять на ощущения со стороны желудка и кишечника.",
            correct_is_truth=False,
            explanation=(
                "Ось «мозг–кишечник» хорошо изучена: стресс может сопровождаться дискомфортом ЖКТ. При стойких симптомах важен "
                "осмотр врача, а не самодиагностика."
            ),
            source_url="",
            sort_order=60,
            is_active=True,
        ),
        dict(
            statement="Каждому взрослому без исключения нужно выпивать ровно 8 стаканов воды в день независимо от жажды, климата и еды.",
            correct_is_truth=False,
            explanation=(
                "Потребность в жидкости зависит от жажды, пищи, нагрузки и погоды. Ориентир — пить по жажде и светлую мочу; "
                "жёсткие «нормы для всех» не отражают индивидуальность."
            ),
            source_url="",
            sort_order=70,
            is_active=True,
        ),
        dict(
            statement="Лёгкая разминка перед тренировкой может снижать риск травм при отсутствии противопоказаний.",
            correct_is_truth=True,
            explanation=(
                "Подготовка суставов и мышц к нагрузке — распространённая рекомендация. При болях или заболеваниях программу "
                "стоит согласовать со специалистом."
            ),
            source_url="",
            sort_order=80,
            is_active=True,
        ),
    ]
    for r in rows:
        MythTruthQuestion.objects.create(**r)


def unseed_myth_truth(apps, schema_editor):
    MythTruthQuestion = apps.get_model("genapp", "MythTruthQuestion")
    MythTruthQuestion.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("genapp", "0013_rename_genapp_inpe_patient_2b5_idx_genapp_inpe_patient_f013e7_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="MythTruthQuestion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("statement", models.TextField(verbose_name="Утверждение")),
                (
                    "correct_is_truth",
                    models.BooleanField(
                        help_text="Если отмечено: верно выбрать «Правда». Если нет — верно «Миф».",
                        verbose_name="Верный ответ — «Правда»",
                    ),
                ),
                ("explanation", models.TextField(verbose_name="Пояснение после ответа")),
                ("source_url", models.URLField(blank=True, verbose_name="Ссылка на источник (необязательно)")),
                ("sort_order", models.PositiveIntegerField(default=0, verbose_name="Порядок")),
                ("is_active", models.BooleanField(default=True, verbose_name="Активен")),
            ],
            options={
                "verbose_name": "Вопрос «миф / правда»",
                "verbose_name_plural": "Тест «миф / правда» — вопросы",
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.RunPython(seed_myth_truth, unseed_myth_truth),
    ]
