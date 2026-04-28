import json
from django.conf import settings
from django.db.models import Q, Count, Max
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.contrib import messages
from .forms import CustomUserCreationForm, CustomAuthenticationForm, UserProfileForm, VitaminTestResultForm
from .models import Gene, UserProfile, UserGenotype, GeneVariant, Recommendation, UserRecommendation, VitaminTestResult, Vitamin
from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt



# genapp/views.py
@login_required
def recommendations_view(request):
    # Получаем генотипы пользователя
    user_genotypes = UserGenotype.objects.filter(user=request.user)
    user_genotypes_count = user_genotypes.count()
    
    # Получаем ID вариантов пользователя
    variant_ids = user_genotypes.values_list('gene_variant_id', flat=True)
    
    # Получаем рекомендации через связь GeneVariantRecommendation
    recommendations = Recommendation.objects.filter(
        genevariantrecommendation__gene_variant_id__in=variant_ids
    ).distinct().select_related().prefetch_related('genevariantrecommendation_set')
    
    # Группируем рекомендации по категориям
    categories = {
        'sport': {'label': 'Спорт', 'recommendations': []},
        'vitamins': {'label': 'Витамины', 'recommendations': []},
        'nutrition': {'label': 'Питание', 'recommendations': []},
        'general': {'label': 'Общее', 'recommendations': []},
    }
    
    # Добавляем гены к каждой рекомендации
    for rec in recommendations:
        # Получаем связанные гены через GeneVariantRecommendation
        related_genes = set()
        for link in rec.genevariantrecommendation_set.filter(gene_variant_id__in=variant_ids):
            related_genes.add(link.gene_variant.gene)
        rec.related_genes = list(related_genes)
        
        # Группируем по категориям
        if rec.category in categories:
            categories[rec.category]['recommendations'].append(rec)
    
    # Удаляем пустые категории
    categories = {k: v for k, v in categories.items() if v['recommendations']}
    
    # Получаем уникальные гены пользователя
    user_genes = Gene.objects.filter(
        variants__usergenotype__user=request.user
    ).distinct()
    
    # Получаем общее количество рекомендаций
    total_recommendations = recommendations.count()
    
    return render(request, 'genapp/recommendations.html', {
        'recommendations': recommendations,
        'categories': categories,
        'total_recommendations': total_recommendations,
        'user_genes_count': user_genes.count(),
        'user_genotypes_count': user_genotypes_count,
    })

@login_required
def passport_view(request):
    user_genotypes = UserGenotype.objects.filter(user=request.user).select_related('gene_variant__gene')
    return render(request, 'genapp/passport.html', {'user_genotypes': user_genotypes})



def articles_view(request):
    return render(request, "genapp/spa_hash_redirect.html", {"hash": "articles"})


def spa_hash_redirect(request, fragment):
    return render(request, "genapp/spa_hash_redirect.html", {"hash": fragment})


@login_required
def genotype_input_view(request):
    # Получаем ВСЕ гены
    all_genes = Gene.objects.prefetch_related('variants').all().order_by('symbol')
    
    # Получаем уже выбранные пользователем гены
    selected_genotypes = UserGenotype.objects.filter(user=request.user).select_related('gene_variant__gene')
    selected_genes = [ug.gene_variant.gene for ug in selected_genotypes]
    selected_gene_ids = [gene.id for gene in selected_genes]
    
    # Гены, доступные для выбора (исключаем уже выбранные)
    available_genes = all_genes.exclude(id__in=selected_gene_ids)
    
    # Подготавливаем данные о вариантах для всех генов
    gene_variants_dict = {}
    for gene in all_genes:
        variants_list = []
        for variant in gene.variants.all():
            variants_list.append({
                'id': variant.id,
                'genotype': variant.genotype,
                'risk_type': variant.risk_type if variant.risk_type else ''
            })
        gene_variants_dict[str(gene.id)] = variants_list
    
    if request.method == 'POST':
        # Получаем данные из формы
        gene_ids = request.POST.getlist('gene')
        variant_ids = request.POST.getlist('variant')
        
        # Проверяем уникальность генов
        unique_gene_ids = set()
        for gene_id in gene_ids:
            if gene_id:  # пропускаем пустые значения
                if gene_id in unique_gene_ids:
                    # Ген выбран повторно - показываем ошибку
                    return render(request, 'genapp/genotype_input.html', {
                        'genes': available_genes,
                        'available_genes': available_genes,
                        'selected_genes': selected_genes,
                        'selected_gene_ids': json.dumps(selected_gene_ids),
                        'gene_variants_js': json.dumps(gene_variants_dict),
                        'error': 'Один ген нельзя выбрать дважды!'
                    })
                unique_gene_ids.add(gene_id)
        
        # Сохраняем новые генотипы
        saved_count = 0
        for gene_id, variant_id in zip(gene_ids, variant_ids):
            if gene_id and variant_id:
                try:
                    variant = GeneVariant.objects.get(id=variant_id, gene_id=gene_id)
                    # Проверяем, не выбран ли уже этот ген
                    if not UserGenotype.objects.filter(
                        user=request.user, 
                        gene_variant__gene_id=gene_id
                    ).exists():
                        UserGenotype.objects.create(user=request.user, gene_variant=variant)
                        saved_count += 1
                except GeneVariant.DoesNotExist:
                    pass
        
        if saved_count > 0:
            # Перенаправляем на страницу паспорта
            return redirect('passport')
        else:
            # Если ничего не сохранили, остаемся на странице
            return redirect('genotype_input')
    
    return render(request, 'genapp/genotype_input.html', {
        'genes': all_genes,  # Все гены для JavaScript
        'available_genes': available_genes,  # Только доступные для выбора
        'selected_genes': selected_genes,
        'selected_gene_ids': json.dumps(selected_gene_ids),
        'gene_variants_js': json.dumps(gene_variants_dict),
    })

@csrf_exempt
def register_view(request):
    if request.user.is_authenticated:
        return redirect('home')
    
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            
            # Создаем профиль пользователя
            UserProfile.objects.create(user=user)
            
            # Автоматически входим
            login(request, user)
            
            messages.success(request, f'Добро пожаловать, {user.first_name}! Регистрация успешна.')
            return redirect('profile')
    else:
        form = CustomUserCreationForm()
    
    return render(request, 'genapp/register.html', {'form': form})

@csrf_exempt
def login_view(request):
    if request.user.is_authenticated:
        return redirect('home')
    
    if request.method == 'POST':
        form = CustomAuthenticationForm(request, data=request.POST)
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            user = authenticate(request, username=username, password=password)
            
            if user is not None:
                login(request, user)
                messages.success(request, f'Добро пожаловать, {user.first_name}!')
                
                # Перенаправляем на следующую страницу или на home
                next_page = request.GET.get('next', 'home')
                return redirect(next_page)
    else:
        form = CustomAuthenticationForm()
    
    return render(request, 'genapp/login.html', {'form': form})

def logout_view(request):
    """Выход без обязательной сессии Django (очищаем при наличии) и редирект на главную."""
    if request.user.is_authenticated:
        logout(request)
        messages.info(request, "Вы успешно вышли из системы.")
    from django.urls import reverse

    return redirect(f"{reverse('home')}?logout=1")


@login_required
def profile_view(request):
    user = request.user
    profile, created = UserProfile.objects.get_or_create(user=user)
    
    if request.method == 'POST':
        form = UserProfileForm(request.POST, instance=profile)
        if form.is_valid():
            form.save()
            messages.success(request, 'Профиль успешно обновлен!')
            return redirect('profile')
    else:
        form = UserProfileForm(instance=profile)
    
    return render(request, 'genapp/profile.html', {
        'form': form,
        'user': user,
        'profile': profile,
    })

def home_view(request):
    context = {}
    
    if request.user.is_authenticated:
        # Для авторизованных пользователей показываем статистику
        try:
            profile = UserProfile.objects.get(user=request.user)
            context['profile'] = profile
        except UserProfile.DoesNotExist:
            pass
    
    return render(request, 'genapp/home.html', context)


@login_required
def vitamin_tests_view(request):
    """Страница для ввода и просмотра результатов анализов на витамины"""
    # Получаем все результаты пользователя
    user_tests = VitaminTestResult.objects.filter(user=request.user).select_related('vitamin').order_by('-test_date')
    
    if request.method == 'POST':
        form = VitaminTestResultForm(request.POST)
        if form.is_valid():
            test_result = form.save(commit=False)
            test_result.user = request.user
            test_result.save()
            
            # Определяем статус для сообщения
            status = test_result.status
            if status == "Норма":
                messages.success(request, f'Анализ на {test_result.vitamin.name} в норме!')
            elif status == "Дефицит":
                messages.warning(request, f'Внимание: дефицит {test_result.vitamin.name}!')
            elif status == "Профицит":
                messages.warning(request, f'Внимание: профицит {test_result.vitamin.name}!')
            else:
                messages.info(request, f'Результат анализа на {test_result.vitamin.name} сохранен.')
            
            return redirect('vitamin_tests')
    else:
        form = VitaminTestResultForm()
    
    # Статистика
    tests_count = user_tests.count()
    normal_count = sum(1 for test in user_tests if test.status == "Норма")
    deficiency_count = sum(1 for test in user_tests if test.status == "Дефицит")
    excess_count = sum(1 for test in user_tests if test.status == "Профицит")
    
    # Получаем все витамины для справочной информации
    vitamins = Vitamin.objects.all().order_by('name')
    
    return render(request, 'genapp/vitamin_tests.html', {
        'user_tests': user_tests,
        'form': form,
        'vitamins': vitamins,
        'tests_count': tests_count,
        'normal_count': normal_count,
        'deficiency_count': deficiency_count,
        'excess_count': excess_count,
    })

@login_required
def vitamin_test_delete_view(request, pk):
    test = get_object_or_404(VitaminTestResult, pk=pk, user=request.user)
    
    if request.method == 'POST':
        vitamin_name = test.vitamin.name
        test.delete()
        messages.success(request, f'Результат анализа на {vitamin_name} удален!')
        return redirect('vitamin_tests')
    
    return render(request, 'genapp/vitamin_test_confirm_delete.html', {'test': test})


def spa_index_view(request):
    return render(request, "genapp/spa/index.html", {"debug": settings.DEBUG})


def privacy_policy_view(request):
    return render(request, "genapp/privacy_policy.html")