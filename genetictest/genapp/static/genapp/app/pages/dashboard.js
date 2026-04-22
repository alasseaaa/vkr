import { requestBrowserNotificationPermission } from "../services/patientNotifications.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadge(status) {
  if (status === "Дефицит") return `<span class="badge bg-danger badge-status">${status}</span>`;
  if (status === "Норма") return `<span class="badge bg-success badge-status">${status}</span>`;
  if (status === "Профицит") return `<span class="badge bg-warning text-dark badge-status">${status}</span>`;
  return `<span class="badge bg-secondary badge-status">${status || "—"}</span>`;
}

function renderCards({ genotypesCount, vitaminTestsCount, deficiencyCount, normalCount, proficitCount }) {
  return `
    <div class="row g-3 mb-3">
      <div class="col-md-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="text-muted small">Генотипы</div>
            <div class="fs-4 fw-semibold">${genotypesCount}</div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="text-muted small">Анализы витаминов</div>
            <div class="fs-4 fw-semibold">${vitaminTestsCount}</div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card border-0 shadow-sm">
          <div class="card-body">
            <div class="text-muted small">Сводка по статусам</div>
            <div class="mt-2 d-flex gap-2 flex-wrap">
              <span class="badge bg-danger">${deficiencyCount} дефицит</span>
              <span class="badge bg-success">${normalCount} норма</span>
              <span class="badge bg-warning text-dark">${proficitCount} профицит</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function render(pageEl, { api, auth, showAlert }) {
  pageEl.innerHTML = `<div class="card"><div class="card-body">Загрузка...</div></div>`;

  const role = String(auth?.role ?? "")
    .trim()
    .toLowerCase();
  const isDoctor = role === "doctor";
  const showAppointmentCta = !isDoctor;
  const showPatientPdf = role === "patient" || role === "admin";

  const [genotypes, vitaminTests, recommendations] = await Promise.all([
    api.patient.listGenotypes(),
    api.patient.listVitaminTests(),
    api.patient.getRecommendations().catch(() => null),
  ]);

  const genotypesCount = genotypes.length || 0;
  const vitaminTestsCount = vitaminTests.length || 0;
  const deficiencyCount = vitaminTests.filter((t) => t.status === "Дефицит").length;
  const normalCount = vitaminTests.filter((t) => t.status === "Норма").length;
  const proficitCount = vitaminTests.filter((t) => t.status === "Профицит").length;

  const topRecCats = recommendations ? Object.keys(recommendations.categories || {}).length : 0;
  const recItems = recommendations
    ? Object.values(recommendations.categories || {}).reduce((n, c) => n + (c.recommendations?.length || 0), 0)
    : 0;

  let profileHint = "";
  let patientDisplay = auth.username || "";
  let patientProfile = null;
  /** Пациент указал дату рождения, пол, рост и вес — блок «Сводка и подсказки» скрываем. */
  let patientProfileCoreComplete = false;

  if (role === "patient" || role === "admin") {
    try {
      patientProfile = await api.patient.getProfile();
      const p = patientProfile;
      const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      patientDisplay = full || p.username || auth.username || "";
      const miss = [];
      if (!p.birth_date) miss.push("дата рождения");
      if (!p.gender) miss.push("пол");
      if (!p.height) miss.push("рост");
      if (!p.weight) miss.push("вес");
      patientProfileCoreComplete = miss.length === 0;
      if (miss.length) {
        profileHint = `<div class="alert alert-light border mb-0 small"><i class="bi bi-info-circle me-2"></i>Для более точной интерпретации укажите в <a href="#/profile">профиле</a>: ${miss.join(", ")}.</div>`;
      } else {
        profileHint = `<div class="text-success small mb-0"><i class="bi bi-check-circle me-1"></i>Профиль заполнен основными антропометрическими данными.</div>`;
      }
    } catch {
      profileHint = "";
    }
  }

  const showHintsCard = role !== "patient" || !patientProfileCoreComplete;
  const showSymptomBanner = role === "patient" || role === "admin";
  const symptomTestBanner = showSymptomBanner
    ? `<div class="symptom-test-hero mb-3 rounded-4 text-white overflow-hidden shadow-lg" style="background: linear-gradient(120deg, #0f2b4a 0%, #0d6efd 45%, #14b8a6 100%);">
        <div class="p-4 p-md-4 d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center justify-content-between gap-3">
          <div class="d-flex gap-3 align-items-start">
            <div class="rounded-3 bg-white bg-opacity-15 p-3 d-none d-sm-flex align-items-center justify-content-center" style="min-width:3.5rem;min-height:3.5rem">
              <i class="bi bi-clipboard2-pulse fs-2" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-uppercase small text-white-50 letter-spacing-1" style="letter-spacing:0.05em">Интерактив</div>
              <h2 class="h4 fw-bold mb-2">Узнайте, какие гены и анализы витаминов логично обсудить</h2>
              <p class="mb-0 small text-white" style="opacity:0.9">Отметьте симптомы — подбор к вашему справочнику в кабинете, не к «всем лабораториям сразу».</p>
            </div>
          </div>
          <div class="d-flex flex-column flex-sm-row align-items-stretch align-items-sm-center gap-2">
            <a class="btn btn-light btn-lg fw-semibold px-4 shadow" href="#/symptom-test">Пройти тест</a>
            <span class="text-white-50 small align-self-center text-sm-center d-none d-md-block">1–2 мин</span>
          </div>
        </div>
      </div>`
    : "";

  const mythTruthCta =
    role === "patient"
      ? `<div class="mb-3">
          <a class="btn btn-outline-primary" href="#/myth-truth">
            <i class="bi bi-patch-question me-2"></i>Тест «Миф или правда?»
          </a>
          <span class="text-muted small ms-2 d-none d-md-inline">Короткий образовательный тест без генетики.</span>
        </div>`
      : "";

  const wellnessMode = role === "patient" && Boolean(patientProfile?.without_genetic_test);
  const wellnessBanner = wellnessMode
    ? `<div class="alert alert-success border-0 bg-success bg-opacity-10 mb-3 small">
        <div class="fw-semibold mb-1">Режим без генетического теста</div>
        <p class="mb-2">Интерфейс упрощён: в меню скрыты разделы с генотипами и паспортом. Персональные рекомендации по ДНК появятся после добавления генотипов — это можно сделать в любой момент, сняв галочку в <a href="#/profile">профиле</a>.</p>
        <p class="mb-0">Материалы без теста: раздел <a href="#/articles">Статьи</a> (категория «Общее здоровье») и анализы витаминов.</p>
      </div>`
    : "";

  let notifBanner = "";
  if (
    role === "patient" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "default"
  ) {
    notifBanner = `
    <div class="alert alert-primary d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <span class="small mb-0">Чтобы получать <strong>push-уведомления</strong> о новых комментариях врача, разрешите уведомления в браузере.</span>
      <button type="button" class="btn btn-sm btn-light" id="btn-enable-push">Разрешить уведомления</button>
    </div>`;
  }

  const appointmentCtaCard = showAppointmentCta
    ? `<div class="card border-primary shadow-sm mb-3" style="border-width: 2px;">
        <div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3 py-3">
          <div class="flex-grow-1" style="min-width: 200px;">
            <div class="fw-semibold text-primary">Запись на очный приём</div>
            <p class="text-muted small mb-0">Выберите удобное время — лечащий врач подтвердит встречу, предложит другое время или ответит в заявке.</p>
          </div>
          <a class="btn btn-primary px-4" href="#/appointments">
            <i class="bi bi-calendar-check me-2"></i>Записаться к врачу
          </a>
        </div>
      </div>`
    : "";

  const pdfToolbar = showPatientPdf
    ? `<div class="d-flex flex-wrap gap-2 mb-3">
          <button type="button" class="btn btn-outline-danger btn-sm" id="btn-download-report" title="Рекомендации и комментарии врача">
            <i class="bi bi-file-earmark-pdf me-1"></i>Скачать отчёт (PDF)
          </button>
        </div>`
    : "";

  let pdConsentStrip = "";
  if ((role === "patient" || role === "admin") && patientProfile) {
    const hasPd =
      patientProfile.has_personal_data_consent === true ||
      (patientProfile.consent_personal_data_at != null && String(patientProfile.consent_personal_data_at).length > 0);
    if (hasPd) {
      const raw = patientProfile.consent_personal_data_at;
      const when = (() => {
        if (!raw) return "";
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
      })();
      pdConsentStrip = `<div class="mb-3 rounded-3 border border-success border-2 bg-white px-3 py-2 d-flex flex-wrap align-items-center gap-2">
        <span class="small mb-0 text-dark"><i class="bi bi-shield-check text-success me-2" aria-hidden="true"></i>
        <strong>Согласие на обработку персональных (мед.) данных</strong> зафиксировано${when ? ` · <span class="text-muted fw-normal">${when}</span>` : ""}
        · <a class="text-nowrap" href="#/profile">подробнее в профиле</a>
        </span>
      </div>`;
    }
  }

  pageEl.innerHTML = `
    <div class="app-page">
    ${symptomTestBanner}
    ${appointmentCtaCard}
    ${notifBanner}
    ${pdfToolbar}
    ${mythTruthCta}
    ${wellnessBanner}
    <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
      <div>
        <h3 class="mb-1">Дашборд</h3>
        <div class="text-muted small">Пациент: <span class="text-dark fw-medium">${escapeHtml(patientDisplay)}</span></div>
      </div>
      <div class="text-end small text-muted">
        <div>Категорий рекомендаций: <strong class="text-dark">${topRecCats}</strong></div>
        <div>Всего рекомендаций: <strong class="text-dark">${recItems}</strong></div>
      </div>
    </div>

    ${pdConsentStrip}

    ${renderCards({ genotypesCount, vitaminTestsCount, deficiencyCount, normalCount, proficitCount })}

    ${
      showHintsCard
        ? `<div class="card shadow-sm mb-3">
      <div class="card-header bg-white fw-semibold">Сводка и подсказки</div>
      <div class="card-body">
        ${
          wellnessMode
            ? `${profileHint && profileHint.includes("alert") ? `${profileHint}<div class="mt-2"></div>` : ""}
               <p class="text-muted small mb-2">Добавляйте <a href="#/vitamin-tests">анализы витаминов</a> — так удобнее вести динамику. Раздел <a href="#/recommendations">Рекомендации</a> наполнится персональными пунктами, когда появятся генотипы.</p>`
            : profileHint ||
              `<p class="text-muted small mb-2">Заполните генотипы и анализы — тогда на паспорте и в рекомендациях появится больше контекста.</p>`
        }
        <ul class="small text-muted mb-0 ps-3">
          ${
            wellnessMode
              ? `<li class="mb-1">Статьи категории «Общее здоровье» подходят без генетического теста.</li>
                 <li class="mb-1">Комментарии врача и история консультаций доступны, если вы прикреплены к лечащему врачу.</li>
                 <li class="mb-1">Запись на очный приём — кнопка выше или меню «Запись к врачу».</li>
                 <li>Чтобы работать с ДНК-данными, отключите режим в профиле — появятся «Генетические данные» и паспорт.</li>`
              : `<li class="mb-1">Новые варианты генов удобно добавлять списком и сразу переходить в паспорт.</li>
                 <li class="mb-1">Статусы витаминов считаются относительно справочных диапазонов в системе.</li>
                 <li class="mb-1">Очный приём: кнопка выше или пункт меню «Запись к врачу» (если врач закреплён за вами).</li>
                 <li>Рекомендации группируются по смысловым категориям — на странице «Рекомендации» есть поиск и фильтр по категории.</li>`
          }
        </ul>
      </div>
    </div>`
        : ""
    }

    <div class="card shadow-sm">
      <div class="card-header bg-white">
        <div class="fw-semibold">Последние анализы витаминов</div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover mb-0 align-middle">
            <thead class="table-light">
              <tr>
                <th>Витамин</th>
                <th>Значение</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              ${(vitaminTests || [])
                .slice(0, 8)
                .map(
                  (t) => `
                <tr>
                  <td><div class="fw-semibold">${t.vitamin_name}</div><div class="text-muted small">${t.vitamin_unit_test || ""}</div></td>
                  <td>${t.test_value}</td>
                  <td>${statusBadge(t.status)}</td>
                  <td>${t.test_date}</td>
                </tr>
              `,
                )
                .join("")}
              ${(vitaminTests || []).length === 0 ? `<tr><td colspan="4" class="text-center text-muted py-4">Нет данных</td></tr>` : ""}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </div>
  `;

  const btnPush = pageEl.querySelector("#btn-enable-push");
  if (btnPush) {
    btnPush.addEventListener("click", async () => {
      const r = await requestBrowserNotificationPermission();
      if (r === "granted") showAlert("success", "Уведомления включены.");
      btnPush.closest(".alert")?.remove();
    });
  }

  const btnPdf = pageEl.querySelector("#btn-download-report");
  if (btnPdf) {
    btnPdf.addEventListener("click", async () => {
      try {
        await api.patient.downloadReportPdf();
        showAlert("success", "PDF-отчёт сохранён.");
      } catch (e) {
        showAlert("danger", e.message);
      }
    });
  }
}
