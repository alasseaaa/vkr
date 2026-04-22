from django.db import models
import datetime
from django.contrib.auth.models import User

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, verbose_name="Пользователь")
    height = models.PositiveIntegerField(null=True, blank=True, verbose_name="Рост (см)")
    weight = models.PositiveIntegerField(null=True, blank=True, verbose_name="Вес (кг)")
    activity_level = models.CharField(
        max_length=16,
        choices=[('low', 'Низкий'), ('medium', 'Средний'), ('high', 'Высокий')],
        blank=True,
        verbose_name="Уровень активности"
    )
    diet_preferences = models.TextField(blank=True, verbose_name="Пищевые предпочтения")
    goals_text = models.TextField(blank=True, verbose_name="Цели")
    without_genetic_test = models.BooleanField(
        default=False,
        verbose_name="Режим без генетического теста",
        help_text="Акцент на статьях и привычках; разделы с генотипами скрыты в меню.",
    )
    consent_personal_data_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Согласие на обработку ПДн (дата/время)",
        help_text="Момент выражения согласия на обработку персональных и медицинских данных в сервисе.",
    )
    consent_text_version = models.CharField(
        max_length=32,
        blank=True,
        default="1",
        verbose_name="Версия текста согласия",
    )
    birth_date = models.DateField(null=True, blank=True, verbose_name="Дата рождения")
    gender = models.CharField(
        max_length=16,
        choices=[('male', 'Мужской'), ('female', 'Женский')],
        blank=True,
        verbose_name="Пол"
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Обновлено")

    def __str__(self):
        return f'Профиль: {self.user.username}'

    class Meta:
        verbose_name = "Профиль пользователя"
        verbose_name_plural = "Профили пользователей"

class Gene(models.Model):
    symbol = models.CharField(max_length=32, unique=True, verbose_name="Символ")
    full_name = models.CharField(max_length=128, blank=True, verbose_name="Полное название")
    description = models.TextField(blank=True, verbose_name="Описание")
    category = models.CharField(
        max_length=32,
        choices=[
            ('metabolism', 'Метаболизм'),
            ('vitamins', 'Витамины'),
            ('sport', 'Спорт'),
            ('nutrition', 'Питание'),
            ('skincare', 'Кожа и старение'),
            ('hair', 'Волосы'),                                                                 
            ('longevity', 'Долголетие'),
            ('detox', 'Детоксикация'),
            ('hormones', 'Гормоны'),
            ('immunity', 'Иммунитет'),
            ('bones', 'Кости и суставы'),
            ('circadian', 'Циркадные ритмы'),
        ],
        blank=True,
        verbose_name="Категория"
    )
    rs_id = models.CharField(max_length=32, blank=True, verbose_name="rsID")
    effect_description = models.TextField(blank=True, verbose_name="Эффект")

    def __str__(self):
        return f'{self.symbol} ({self.rs_id})'
    
    class Meta:
        verbose_name = "Ген"
        verbose_name_plural = "Гены"

class GeneVariant(models.Model):
    gene = models.ForeignKey(Gene, on_delete=models.CASCADE, related_name='variants', verbose_name="Ген")
    genotype = models.CharField(max_length=8, verbose_name="Генотип")  # Например: AA/AG/GG
    risk_type = models.CharField(
        max_length=16,
        choices=[
            ('low', 'Низкий'),
            ('medium', 'Средний'),
            ('high', 'Высокий'),
        ],
        blank=True,
        verbose_name="Тип риска"
    )
    variant_description = models.TextField(blank=True, verbose_name="Описание варианта")

    def __str__(self):
        return f'{self.gene.symbol} {self.genotype}'
    
    class Meta:
        verbose_name = "Вариант гена"
        verbose_name_plural = "Варианты генов"

class Recommendation(models.Model):
    title = models.CharField(max_length=128, verbose_name="Заголовок")
    description = models.TextField(verbose_name="Описание")
    category = models.CharField(
        max_length=32,
        choices=[
            ("sport", "Спорт"),
            ("vitamins", "Витамины"),
            ("nutrition", "Питание"),
            ("general", "Общее"),
            ("skincare", "Кожа"),
            ("hair", "Волосы"),
            ("longevity", "Долголетие"),
            ("circadian", "Режим / сон"),
            ("hormones", "Гормоны"),
            ("detox", "Детокс / антиоксиданты"),
            ("bones", "Кости / кальций"),
            ("metabolism", "Метаболизм"),
        ],
        blank=True,
        verbose_name="Категория",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.title
    
    class Meta:
        verbose_name = "Рекомендация"
        verbose_name_plural = "Рекомендации"

class GeneVariantRecommendation(models.Model):
    gene_variant = models.ForeignKey(GeneVariant, on_delete=models.CASCADE, verbose_name="Вариант гена")
    recommendation = models.ForeignKey(Recommendation, on_delete=models.CASCADE, verbose_name="Рекомендация")

    def __str__(self):
        return f'{self.gene_variant} → {self.recommendation.title}'
    
    class Meta:
        verbose_name = "Связь 'Вариант гена — Рекомендация'"
        verbose_name_plural = "Связи 'Вариант гена — Рекомендация'"

class UserGenotype(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Пользователь")
    gene_variant = models.ForeignKey(GeneVariant, on_delete=models.CASCADE, verbose_name="Вариант гена")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Создано")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Обновлено")

    def __str__(self):
        return f'{self.user.username}: {self.gene_variant}'
    
    class Meta:
        verbose_name = "Генотип пользователя"
        verbose_name_plural = "Генотипы пользователей"

class UserRecommendation(models.Model):
    STATUS_CHOICES = [
        ('new', 'Новая'),
        ('seen', 'Просмотрена'),
        ('applied', 'Применена'),
        ('dismissed', 'Отклонена')
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Пользователь")
    recommendation = models.ForeignKey(Recommendation, on_delete=models.CASCADE, verbose_name="Рекомендация")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='new', verbose_name="Статус")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Создано")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Обновлено")

    def __str__(self):
        return f'{self.user.username}: {self.recommendation.title} ({self.status})'
    
    class Meta:
        verbose_name = "Пользовательская рекомендация"
        verbose_name_plural = "Пользовательские рекомендации"

class Article(models.Model):
    title = models.CharField(max_length=256, verbose_name="Название")
    content = models.TextField(verbose_name="Содержание")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата публикации")
    category = models.CharField(
        max_length=32,
        choices=[
            ('metabolism', 'Метаболизм'),
            ('sport', 'Спорт'),
            ('vitamins', 'Витамины'),
            ('nutrition', 'Питание'),
            ('wellness', 'Общее здоровье (без теста)'),
        ],
        blank=True,
        verbose_name="Категория"
    )
    source_url = models.URLField(blank=True, verbose_name="Ссылка на источник")
    author = models.CharField(max_length=128, blank=True, verbose_name="Автор")
    gene = models.ForeignKey(Gene, null=True, blank=True, on_delete=models.SET_NULL, related_name='articles', verbose_name="Ген")

    def __str__(self):
        return self.title
    
    class Meta:
        verbose_name = "Статья"
        verbose_name_plural = "Статьи"


class MythTruthQuestion(models.Model):
    """Образовательный вопрос «миф / правда» (без привязки к генетике)."""

    statement = models.TextField(verbose_name="Утверждение")
    correct_is_truth = models.BooleanField(
        verbose_name='Верный ответ — «Правда»',
        help_text="Если отмечено: верно выбрать «Правда». Если нет — верно «Миф».",
    )
    explanation = models.TextField(verbose_name="Пояснение после ответа")
    source_url = models.URLField(blank=True, verbose_name="Ссылка на источник (необязательно)")
    sort_order = models.PositiveIntegerField(default=0, verbose_name="Порядок")
    is_active = models.BooleanField(default=True, verbose_name="Активен")

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name = "Вопрос «миф / правда»"
        verbose_name_plural = "Тест «миф / правда» — вопросы"

    def __str__(self):
        return (self.statement[:80] + "…") if len(self.statement) > 80 else self.statement


class Vitamin(models.Model):
    name = models.CharField(max_length=64, verbose_name="Название")
    description = models.TextField(blank=True, verbose_name="Описание")
    daily_norm_value = models.FloatField(null=True, blank=True, verbose_name="Дневная норма")
    upper_limit_value = models.FloatField(null=True, blank=True, verbose_name="Верхний предел")
    unit = models.CharField(max_length=16, blank=True, verbose_name="Ед. измерения прием внутрь")  # mg / mcg
    unit_test = models.CharField(max_length=16, blank=True, verbose_name="Ед. измерения в анализе")
    category = models.CharField(
        max_length=32,
        choices=[('fat-soluble', 'Жирорастворимый'), ('water-soluble', 'Водорастворимый')],
        blank=True,
        verbose_name="Категория"
    )
    ref_min = models.FloatField(null=True, blank=True, verbose_name="Минимальное реф. значение")
    ref_max = models.FloatField(null=True, blank=True, verbose_name="Максимальное реф. значение")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name = "Витамин"
        verbose_name_plural = "Витамины"

class GeneVitamin(models.Model):
    gene = models.ForeignKey(Gene, on_delete=models.CASCADE, verbose_name="Ген")
    vitamin = models.ForeignKey(Vitamin, on_delete=models.CASCADE, verbose_name="Витамин")
    # effect_type = models.CharField(max_length=32, blank=True, verbose_name="Тип влияния")  # absorption / metabolism / transport
    effect_description = models.TextField(blank=True, verbose_name="Описание влияния")

    def __str__(self):
        return f'{self.gene.symbol} ↔ {self.vitamin.name}'
    
    class Meta:
        verbose_name = "Связь ген-витамин"
        verbose_name_plural = "Связи ген-витамин"

class VitaminGenotypeEffect(models.Model):
    gene_variant = models.ForeignKey(GeneVariant, on_delete=models.CASCADE, verbose_name="Вариант гена")
    vitamin = models.ForeignKey(Vitamin, on_delete=models.CASCADE, verbose_name="Витамин")
    impact_level = models.CharField(
        max_length=16,
        choices=[('low','Низкий'),('medium','Средний'),('high','Высокий')],
        blank=True,
        verbose_name="Уровень влияния"
    )
    effect_text = models.TextField(blank=True, verbose_name="Эффект")

    def __str__(self):
        return f'{self.gene_variant} → {self.vitamin.name}'
    
    class Meta:
        verbose_name = "Влияние генотипа на витамин"
        verbose_name_plural = "Влияния генотипов на витамины"

class VitaminTestResult(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Пользователь", related_name='vitamin_tests')
    vitamin = models.ForeignKey(Vitamin, on_delete=models.CASCADE, verbose_name="Витамин")
    test_value = models.FloatField(verbose_name="Результат анализа")
    test_date = models.DateField(verbose_name="Дата анализа", default=datetime.date.today)
    
    # Вычисляемое свойство для определения статуса
    @property
    def status(self):
        """Определяет статус анализа на основе референсных значений витамина"""
        if not self.vitamin:
            return "Не определен"
        
        # Проверяем наличие референсных значений
        if self.vitamin.ref_min is None or self.vitamin.ref_max is None:
            return "Нет референсных значений"
        
        test_value = self.test_value

        if test_value < self.vitamin.ref_min:
            return "Дефицит"
        if self.vitamin.ref_min <= test_value <= self.vitamin.ref_max:
            return "Норма"
        return "Профицит"
    
    # Вычисляемое свойство для определения цветового класса
    @property
    def status_class(self):
        """Возвращает CSS класс для статуса"""
        status = self.status
        if status == "Норма":
            return "success"
        elif status == "Дефицит":
            return "danger"
        elif status == "Профицит":
            return "warning"
        else:
            return "secondary"
    
    def __str__(self):
        return f'{self.user.username}: {self.vitamin.name} - {self.test_value} ({self.status})'
    
    class Meta:
        verbose_name = "Результат анализа на витамин"
        verbose_name_plural = "Результаты анализов на витамины"
        ordering = ['-test_date']


class DoctorPatient(models.Model):
    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doctor_patients', verbose_name="Врач")
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='patient_doctors', verbose_name="Пациент")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата привязки")

    class Meta:
        verbose_name = "Связь врач-пациент"
        verbose_name_plural = "Связи врач-пациент"
        constraints = [
            models.UniqueConstraint(fields=['doctor', 'patient'], name='unique_doctor_patient')
        ]

    def __str__(self):
        return f'{self.doctor.username} ↔ {self.patient.username}'


class DoctorComment(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Черновик'),
        ('published', 'Опубликован'),
        ('deleted', 'Удален'),
    ]

    doctor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doctor_comments', verbose_name="Врач")
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='patient_comments', verbose_name="Пациент")

    # Комментарий может относиться к конкретному генотипу...
    genotype = models.ForeignKey(
        'UserGenotype',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='doctor_comments',
        verbose_name="К генотипу",
    )
    # ...или к конкретному анализу витамина.
    vitamin_test = models.ForeignKey(
        'VitaminTestResult',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='doctor_comments',
        verbose_name="К анализу витамина",
    )

    text = models.TextField(verbose_name="Комментарий")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft', verbose_name="Статус")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Дата обновления")

    class Meta:
        verbose_name = "Комментарий врача"
        verbose_name_plural = "Комментарии врача"
        ordering = ['-created_at']

    def __str__(self):
        target = []
        if self.genotype_id:
            target.append(f'genotype:{self.genotype_id}')
        if self.vitamin_test_id:
            target.append(f'vitamin_test:{self.vitamin_test_id}')
        target_str = ','.join(target) if target else 'patient'
        return f'{self.patient.username} ({self.status}) [{target_str}]'


class DoctorCommentHistory(models.Model):
    comment = models.ForeignKey(DoctorComment, on_delete=models.CASCADE, related_name='history', verbose_name="Комментарий")
    edited_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doctor_comment_edits', verbose_name="Редактор")

    previous_text = models.TextField(verbose_name="Предыдущее содержание")
    previous_status = models.CharField(max_length=16, choices=DoctorComment.STATUS_CHOICES, verbose_name="Предыдущий статус")
    previous_genotype_id = models.PositiveIntegerField(null=True, blank=True, verbose_name="Предыдущий генотип (id)")
    previous_vitamin_test_id = models.PositiveIntegerField(null=True, blank=True, verbose_name="Предыдущий анализ витамина (id)")

    edited_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата редактирования")

    class Meta:
        verbose_name = "История комментария врача"
        verbose_name_plural = "Истории комментариев врача"
        ordering = ['-edited_at']

    def __str__(self):
        return f'History for comment #{self.comment_id} by {self.edited_by.username}'


class InPersonAppointment(models.Model):
    """Заявка пациента на очную встречу с врачом (подтверждение вручную)."""

    STATUS_PENDING = "pending"
    STATUS_CONFIRMED = "confirmed"
    STATUS_DECLINED = "declined"
    STATUS_CANCELLED_BY_PATIENT = "cancelled_by_patient"
    STATUS_CANCELLED_BY_DOCTOR = "cancelled_by_doctor"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Ожидает ответа"),
        (STATUS_CONFIRMED, "Подтверждено"),
        (STATUS_DECLINED, "Отклонено"),
        (STATUS_CANCELLED_BY_PATIENT, "Отменено пациентом"),
        (STATUS_CANCELLED_BY_DOCTOR, "Отменено врачом"),
    ]

    patient = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="in_person_appointments_as_patient",
        verbose_name="Пациент",
    )
    doctor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="in_person_appointments_as_doctor",
        verbose_name="Врач",
    )
    requested_start = models.DateTimeField(verbose_name="Желаемая дата и время")
    confirmed_start = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Подтверждённая дата и время",
    )
    patient_note = models.TextField(blank=True, verbose_name="Комментарий пациента")
    doctor_message = models.TextField(blank=True, verbose_name="Сообщение врача")
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        verbose_name="Статус",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Создано")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Обновлено")

    class Meta:
        verbose_name = "Заявка на очный приём"
        verbose_name_plural = "Заявки на очные приёмы"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["doctor", "status"]),
        ]

    def __str__(self):
        return f"{self.patient.username} → {self.doctor.username} ({self.get_status_display()})"


class PatientNotification(models.Model):
    """Push/in-app уведомление пациента (например, опубликованный комментарий врача)."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="patient_notifications",
        verbose_name="Пациент",
    )
    comment = models.ForeignKey(
        DoctorComment,
        on_delete=models.CASCADE,
        related_name="patient_notifications",
        null=True,
        blank=True,
        verbose_name="Комментарий",
    )
    appointment = models.ForeignKey(
        "InPersonAppointment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patient_notifications",
        verbose_name="Заявка на приём",
    )
    title = models.CharField(max_length=200, verbose_name="Заголовок")
    body = models.TextField(blank=True, verbose_name="Текст")
    is_read = models.BooleanField(default=False, verbose_name="Прочитано")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Создано")

    class Meta:
        verbose_name = "Уведомление пациента"
        verbose_name_plural = "Уведомления пациентов"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.username}: {self.title[:50]}"