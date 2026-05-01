import { requestBrowserNotificationPermission } from "../services/patientNotifications.js";

const KEY_JUST_REGISTERED = "genapp_just_registered";
const KEY_LAST_VISIT = "genapp_dashboard_last_visit";
const KEY_VIT_SIG = "genapp_vitamin_signature";
const KEY_VIT_ACTIVITY_TS = "genapp_vitamin_activity_ts";

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
  if (status === "Профицит")
    return `<span class="badge bg-warning text-dark badge-status">${status}</span>`;
  return `<span class="badge bg-secondary badge-status">${status || "—"}</span>`;
}

function vitStatusToBarClass(st) {
  if (st === "Дефицит") return "bg-danger";
  if (st === "Норма") return "bg-success";
  if (st === "Профицит") return "bg-warning";
  return "bg-secondary";
}

function vitStatusToFillPercent(st) {
  if (st === "Норма") return 100;
  if (st === "Профицит" || st === "Дефицит") return 50;
  return 25;
}

function formatDateRu(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function consumeJustRegistered() {
  try {
    if (sessionStorage.getItem(KEY_JUST_REGISTERED) === "1") {
      sessionStorage.removeItem(KEY_JUST_REGISTERED);
      return true;
    }
  } catch {
    /* */
  }
  return false;
}

function readAndUpdateLastVisit() {
  let previousLabel = "—";
  try {
    const raw = sessionStorage.getItem(KEY_LAST_VISIT);
    if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        previousLabel = d.toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
    }
    sessionStorage.setItem(KEY_LAST_VISIT, new Date().toISOString());
  } catch {
    /* */
  }
  return previousLabel;
}

function readVitaminActivityTs(vitaminTests) {
  try {
    const signature = (vitaminTests || [])
      .map((v) => `${v.id}:${v.vitamin}:${v.test_value}:${v.test_date}`)
      .sort()
      .join("|");
    const prevSig = sessionStorage.getItem(KEY_VIT_SIG) || "";
    let ts = Number(sessionStorage.getItem(KEY_VIT_ACTIVITY_TS) || 0);
    if (signature && signature !== prevSig) {
      ts = Date.now();
      sessionStorage.setItem(KEY_VIT_ACTIVITY_TS, String(ts));
      sessionStorage.setItem(KEY_VIT_SIG, signature);
    } else if (!signature) {
      sessionStorage.removeItem(KEY_VIT_SIG);
      sessionStorage.removeItem(KEY_VIT_ACTIVITY_TS);
      ts = 0;
    }
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function pickTopRecs(recommendations, n = 3) {
  const out = [];
  if (!recommendations?.categories) return out;
  for (const [ck, cat] of Object.entries(recommendations.categories)) {
    for (const r of cat.recommendations || []) {
      if (r?.title) {
        out.push({ ...r, _catLabel: cat.label || "Рекомендации", _catKey: ck });
        if (out.length >= n) return out;
      }
    }
  }
  return out;
}

const REC_CAT_STYLE = {
  sport: { accent: "primary", border: "#0d6efd" },
  vitamins: { accent: "info", border: "#0dcaf0" },
  nutrition: { accent: "success", border: "#198754" },
  general: { accent: "secondary", border: "#6c757d" },
  default: { accent: "primary", border: "#0d6efd" },
};

function recTeaserStyle(categoryKey) {
  const k = (categoryKey || "default").toLowerCase();
  return REC_CAT_STYLE[k] || REC_CAT_STYLE.default;
}

/**
 * @param {Array} vitaminTests
 * @returns {{ needMore: boolean, labels: string[], datasets: object[] } | null }
 */
function buildChartPayload(vitaminTests) {
  if (!Array.isArray(vitaminTests) || !vitaminTests.length) return null;
  const byV = new Map();
  for (const t of vitaminTests) {
    const id = t.vitamin;
    if (id == null) continue;
    if (!byV.has(id)) {
      byV.set(id, { name: t.vitamin_name || "—", points: [] });
    }
    const n = parseFloat(String(t.test_value ?? "").replace(",", "."));
    const y = Number.isFinite(n) ? n : null;
    byV.get(id).points.push({ date: t.test_date, y, raw: t });
  }
  for (const v of byV.values()) {
    v.points.sort((a, b) => {
      const da = a.date ? new Date(a.date) : 0;
      const db = b.date ? new Date(b.date) : 0;
      return da - db;
    });
  }
  const entries = [...byV.entries()];
  const with2 = entries.filter(([, v]) => v.points.length >= 2);
  const sortPool = (with2.length ? with2 : entries).sort(
    (a, b) => b[1].points.length - a[1].points.length,
  );
  const [firstKey, firstData] = sortPool[0] || [];
  if (firstData == null) return null;
  if (!with2.length) {
    return {
      needMore: true,
      labels: [],
      datasets: [],
      hintVitaminName: firstData.name,
    };
  }
  const topSeries = sortPool
    .filter(([, d]) => d.points.length >= 2)
    .slice(0, 3)
    .map(([key, d]) => ({ key, name: d.name, points: d.points }));
  if (!topSeries.length) {
    return {
      needMore: true,
      labels: [],
      datasets: [],
      hintVitaminName: firstData.name,
    };
  }
  const dateSet = new Set();
  for (const s of topSeries) {
    for (const p of s.points) {
      if (p.date != null && p.date !== "") dateSet.add(String(p.date).trim());
    }
  }
  if (dateSet.size < 2) {
    return {
      needMore: true,
      labels: [],
      datasets: [],
      hintVitaminName: topSeries[0]?.name || firstData.name,
    };
  }
  const labelRaw = [...dateSet].sort((a, b) => {
    const da = new Date(a);
    const db = new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return String(a).localeCompare(String(b));
    return da - db;
  });
  const labels = labelRaw.map((d) => {
    const x = new Date(d);
    return !Number.isNaN(x.getTime())
      ? x.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
      : String(d);
  });
  const lineColors = [
    { border: "rgba(13, 110, 253, 0.95)", bg: "rgba(13, 110, 253, 0.08)" },
    { border: "rgba(25, 135, 84, 0.95)", bg: "rgba(25, 135, 84, 0.08)" },
    { border: "rgba(13, 202, 240, 0.95)", bg: "rgba(13, 202, 240, 0.08)" },
  ];
  const datasets = topSeries.map((s, i) => {
    const c = lineColors[i % lineColors.length];
    const byDate = new Map(s.points.map((p) => [String(p.date).trim(), p.y]));
    const data = labelRaw.map((ld) => (byDate.has(ld) ? byDate.get(ld) : null));
    return {
      label: s.name,
      data,
      borderColor: c.border,
      backgroundColor: c.bg,
      fill: topSeries.length === 1,
      spanGaps: true,
      tension: 0.25,
      pointRadius: 3,
      pointBackgroundColor: c.border,
    };
  });
  return { needMore: false, labels, datasets, seriesCount: topSeries.length };
}

function buildActivityItems(genotypes, vitaminTests, comments) {
  const items = [];
  (genotypes || []).forEach((g) => {
    const d = g.created_at ? new Date(g.created_at) : null;
    const t = d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
    if (!t) return;
    items.push({
      t,
      icon: "dna",
      text: `Генотип: ${(g.gene_symbol || "ген").toString()}`,
      sub: d.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    });
  });
  (vitaminTests || []).forEach((v) => {
    const d = v.test_date ? new Date(v.test_date) : null;
    const t = d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
    if (!t) return;
    items.push({
      t,
      icon: "vit",
      text: `Анализ: ${v.vitamin_name || "витамин"}`,
      sub: formatDateRu(v.test_date),
    });
  });
  (comments || []).forEach((c) => {
    let t = 0;
    if (c.created_at && String(c.created_at).includes(".")) {
      const p = String(c.created_at).split(".");
      if (p.length === 3) t = new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
    }
    if (!t && c.id) t = c.id;
    if (!t) t = 0;
    const doc = c.doctor_name || "врач";
    items.push({
      t: t || Date.now(),
      icon: "doc",
      text: `Комментарий: ${(c.text || "").toString().slice(0, 100)}${(c.text || "").length > 100 ? "…" : ""}`,
      sub: formatDateRu(c.created_at),
      who: doc,
    });
  });
  items.sort((a, b) => b.t - a.t);
  return items.slice(0, 5);
}

/** Цитата в футере дашборда */
const DASH_FOOTER_QUOTE = {
  t: "Гены заряжают пистолет, а образ жизни нажимает на курок.",
  a: "Доктор Фрэнсис Коллинз, генетик, директор Национальных институтов здравоохранения США",
};

function destroyChartOnPage(pageEl) {
  const c = pageEl?._dashboardVitaminChart;
  if (c) {
    try {
      c.destroy();
    } catch {
      /* */
    }
    pageEl._dashboardVitaminChart = null;
  }
}

function tryInitVitaminChart(pageEl, vitaminTests) {
  destroyChartOnPage(pageEl);
  const el = pageEl.querySelector("#dashboard-vitamin-chart");
  if (!el || !window.Chart) return;
  const payload = buildChartPayload(vitaminTests);
  if (!payload || payload.needMore || !payload.labels?.length || !payload.datasets?.length) {
    return;
  }
  const ctx = el.getContext("2d");
  pageEl._dashboardVitaminChart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: payload.labels,
      datasets: payload.datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: (payload.seriesCount || 0) > 1, position: "top" } },
      scales: {
        y: { beginAtZero: false },
        x: { display: true },
      },
    },
  });
}

export async function render(pageEl, { api, auth, showAlert }) {
  const role = String(auth?.role ?? "")
    .trim()
    .toLowerCase();
  if (role === "doctor") {
    pageEl.innerHTML = `<div class="app-page p-2"><div class="alert alert-info border-0">Кабинет врача: откройте <a class="alert-link" href="#/doctor/patients">список пациентов</a>.</div></div>`;
    return;
  }

  pageEl.innerHTML = `<div class="card app-card border-0"><div class="card-body py-5 text-center text-muted">Загрузка…</div></div>`;

  const isDoctor = false;
  const showAppointmentCta = true;
  const showPatientPdf = role === "patient" || role === "admin";
  const isPatient = role === "patient";
  const isAdmin = role === "admin";

  const [genotypes, vitaminTests, recommendations, comments, appointments, unreadNotificationsData] = await Promise.all([
    api.patient.listGenotypes(),
    api.patient.listVitaminTests(),
    api.patient.getRecommendations().catch(() => null),
    (isPatient || isAdmin
      ? api.comments.list().catch(() => [])
      : Promise.resolve([])) || Promise.resolve([]),
    (isPatient || isAdmin
      ? api.patient.listAppointments().catch(() => [])
      : Promise.resolve([])) || Promise.resolve([]),
    (isPatient || isAdmin
      ? api.patient.getUnreadNotifications().catch(() => ({ items: [] }))
      : Promise.resolve({ items: [] })) || Promise.resolve({ items: [] }),
  ]);

  const commentList = Array.isArray(comments) ? comments : comments?.results || [];
  const apptList = Array.isArray(appointments) ? appointments : [];
  const unreadNotifications = Array.isArray(unreadNotificationsData?.items) ? unreadNotificationsData.items : [];
  const recommendationReminders = unreadNotifications.filter((n) => n?.user_recommendation != null);
  const hasUpcomingAppt = apptList.some((a) =>
    String(a?.status || "").toLowerCase().match(/pending|confirm|оформ/),
  );

  const genotypesCount = genotypes.length || 0;
  const vitaminTestsCount = vitaminTests.length || 0;
  const deficiencyCount = (vitaminTests || []).filter((t) => t.status === "Дефицит").length;
  const normalCount = (vitaminTests || []).filter((t) => t.status === "Норма").length;
  const proficitCount = (vitaminTests || []).filter((t) => t.status === "Профицит").length;

  const recCats = recommendations ? Object.keys(recommendations.categories || {}).length : 0;
  const recItems = recommendations
    ? Object.values(recommendations.categories || {}).reduce(
        (n, c) => n + (c.recommendations?.length || 0),
        0,
      )
    : 0;
  const topRecs = pickTopRecs(recommendations, 3);

  let profileHint = "";
  let patientDisplay = auth.username || "";
  let patientProfile = null;
  let patientProfileCoreComplete = false;
  const justRegistered = (isPatient || isAdmin) ? consumeJustRegistered() : false;

  if (isPatient || isAdmin) {
    try {
      patientProfile = await api.patient.getProfile();
      const p = patientProfile;
      const full = [p.last_name, p.first_name, p.patronymic].filter(Boolean).join(" ").trim();
      patientDisplay = full || p.username || auth.username || "";
      const miss = [];
      if (!(p.patronymic || "").trim()) miss.push("отчество");
      if (!p.birth_date) miss.push("дата рождения");
      if (!p.gender) miss.push("пол");
      if (!p.height) miss.push("рост");
      if (!p.weight) miss.push("вес");
      patientProfileCoreComplete = miss.length === 0;
      if (miss.length) {
        profileHint = `В <a href="#/profile">профиле</a> уточните: ${miss.join(", ")}.`;
      } else {
        profileHint = `Профиль с основными данными заполнен.`;
      }
    } catch {
      profileHint = "";
    }
  }

  const wellnessMode = isPatient && Boolean(patientProfile?.without_genetic_test);
  const isEmpty = genotypesCount === 0 && vitaminTestsCount === 0;
  const showOnboarding = (isPatient || isAdmin) && (justRegistered || isEmpty) && !wellnessMode;
  const showOnboardingWellness = (isPatient || isAdmin) && (justRegistered || isEmpty) && wellnessMode;

  const showHintsCard = isPatient && !patientProfileCoreComplete && !justRegistered;
  const chartPayload = buildChartPayload(vitaminTests);
  const activityItems = buildActivityItems(genotypes, vitaminTests, commentList);

  const fillPct = wellnessMode
    ? Math.round(
        ((patientProfileCoreComplete ? 1 : 0) + (vitaminTestsCount > 0 ? 1 : 0)) / 2 * 100,
      )
    : Math.round(
        ((patientProfileCoreComplete ? 1 : 0) + (genotypesCount > 0 ? 1 : 0) + (vitaminTestsCount > 0 ? 1 : 0)) /
          3 *
          100,
      );

  const stepProfileDone = patientProfileCoreComplete;
  const stepGeneDone = wellnessMode ? true : genotypesCount > 0;
  const stepVitDone = vitaminTestsCount > 0;
  const reportReady = fillPct >= 100;
  const doneSectionsCount = wellnessMode
    ? (stepProfileDone ? 1 : 0) + (stepVitDone ? 1 : 0)
    : (stepProfileDone ? 1 : 0) + (stepGeneDone ? 1 : 0) + (stepVitDone ? 1 : 0);
  const totalSectionsCount = wellnessMode ? 2 : 3;
  const progressBarClass = fillPct <= 0 ? "bg-secondary" : fillPct >= 100 ? "bg-success" : "bg-primary";
  const progressHint = !stepProfileDone
    ? "Начните с профиля — это займёт 1 минуту."
    : !wellnessMode && !stepGeneDone
      ? "Добавьте гены — это самый важный шаг для рекомендаций."
      : !stepVitDone
        ? "Добавьте анализы витаминов, чтобы увидеть полную картину."
        : "Отлично! Ваш кабинет полностью готов.";
  const passportStatus = wellnessMode ? "Не используется" : genotypesCount > 0 ? "Заполнен" : "Пусто";
  const nextStepKey = !stepProfileDone
    ? "profile"
    : !wellnessMode && !stepGeneDone
      ? "genes"
      : !stepVitDone
        ? "vitamins"
        : "report";

  const renderHeroStep = (cfg) => {
    const doneCls = cfg.done ? "dash-step--done" : "";
    const activeCls = !cfg.done && cfg.key === nextStepKey ? "dash-step--active" : "";
    const statusText = cfg.done ? "заполнено" : "заполнить";
    const circleCls = cfg.key === "report" ? "dash-step__circle dash-step__circle--report" : "dash-step__circle";
    return `<a class="dash-step ${doneCls} ${activeCls} text-decoration-none" href="${cfg.href}">
      <div class="${circleCls}"><i class="bi ${cfg.icon}" aria-hidden="true"></i></div>
      <div class="dash-step__label">${cfg.label}</div>
      <div class="dash-step__meta">${statusText}</div>
    </a>`;
  };
  const isOnboardingActive = (key, done) => !done && key === nextStepKey;

  const notifHtml =
    isPatient &&
    typeof Notification !== "undefined" &&
    Notification.permission === "default"
      ? `<div class="alert alert-primary border-0 py-2 px-3 mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2 dashboard-animate">
      <span class="small mb-0">Ответы врача: разрешите <strong>уведомления</strong> браузера.</span>
      <button type="button" class="btn btn-sm btn-light" id="btn-enable-push">Разрешить</button>
    </div>`
      : "";
  const remindersHtml = recommendationReminders.length
    ? `<div class="card app-card border-0 shadow-sm mb-3 dashboard-animate">
      <div class="card-header bg-white fw-semibold">Напоминания по рекомендациям</div>
      <div class="card-body">
        ${recommendationReminders
          .map(
            (n) => `<div class="border rounded-3 p-3 mb-2" data-reminder-id="${escapeHtml(n.id)}" data-user-rec-id="${escapeHtml(n.user_recommendation)}">
              <div class="d-flex align-items-start justify-content-between gap-2">
                <div>
                  <div class="fw-semibold">${escapeHtml(n.title || "Напоминание")}</div>
                  <div class="small text-muted">${escapeHtml(n.body || "")}</div>
                </div>
                <div class="text-nowrap small text-muted">${escapeHtml(formatDateRu(n.created_at))}</div>
              </div>
              <div class="mt-2 d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm btn-outline-success" data-action="done-reminder" data-id="${escapeHtml(n.id)}" data-user-rec-id="${escapeHtml(n.user_recommendation)}">Выполнено</button>
                <a class="btn btn-sm btn-outline-primary" href="#/recommendations?highlight=${encodeURIComponent(String(n.user_recommendation))}" data-action="open-reminder" data-id="${escapeHtml(n.id)}">Перейти к рекомендации</a>
              </div>
            </div>`,
          )
          .join("")}
      </div>
    </div>`
    : "";

  const onboardingW =
    showOnboardingWellness && (isPatient || isAdmin)
      ? `<div class="card border-0 shadow-sm mb-3 dashboard-animate" style="background: linear-gradient(180deg, #f8f9ff 0%, #fff 100%)">
    <div class="card-body p-4">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        ${justRegistered ? `<span class="badge text-bg-success">Первый вход</span>` : ""}
        <h2 class="h5 mb-0">С чего начать (без генетического теста)</h2>
      </div>
      <p class="text-muted small mb-3">Режим wellness: фокус на <strong>профиль</strong>, <strong>статьи</strong> и <strong>витамины</strong>.</p>
      <div class="row g-3">
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 bg-white shadow-sm" href="#/profile">
            <i class="bi bi-person-vcard text-primary fs-3 d-block mb-2"></i>
            <div class="fw-semibold text-dark">Профиль</div>
            <div class="small text-muted">Антропометрия, цели</div>
          </a>
        </div>
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 bg-white shadow-sm" href="#/articles">
            <i class="bi bi-newspaper text-primary fs-3 d-block mb-2"></i>
            <div class="fw-semibold text-dark">Статьи</div>
            <div class="small text-muted">Материалы</div>
          </a>
        </div>
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 bg-white shadow-sm" href="#/vitamins">
            <i class="bi bi-droplet-half text-info fs-3 d-block mb-2"></i>
            <div class="fw-semibold text-dark">Анализы</div>
            <div class="small text-muted">Внести показатели</div>
          </a>
        </div>
      </div>
    </div>
  </div>`
      : "";

  const onboardingD =
    showOnboarding && !isDoctor
      ? reportReady
        ? `<div class="card border-0 shadow-sm mb-3 dashboard-animate" style="background: linear-gradient(180deg, #edf7ef 0%, #fff 100%)">
    <div class="card-body p-4">
      <h2 class="h5 mb-2">Все разделы заполнены! Ваш отчёт готов.</h2>
      <p class="text-muted small mb-3">Можно скачать персонализированный PDF-отчёт и перейти к рекомендациям.</p>
      <button type="button" class="btn btn-success btn-sm" id="btn-download-report-inline">
        <i class="bi bi-file-earmark-arrow-down me-1" aria-hidden="true"></i> Скачать PDF →
      </button>
    </div>
  </div>`
        : `<div class="card border-0 shadow-sm mb-3 dashboard-animate" style="background: linear-gradient(180deg, #f0f4ff 0%, #fff 100%)">
    <div class="card-body p-4">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        ${justRegistered ? `<span class="badge text-bg-success">Добро пожаловать</span>` : ""}
        <h2 class="h5 mb-0">Как получить персональные рекомендации</h2>
      </div>
      <p class="text-muted small mb-3">Заполните три раздела, и система сформирует ваш генетический паспорт и список рекомендаций.</p>
      <div class="row g-3 mt-1">
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 ${isOnboardingActive("profile", stepProfileDone) ? "border-primary" : "bg-white"} ${isOnboardingActive("profile", stepProfileDone) ? "" : "shadow-sm"}" style="${isOnboardingActive("profile", stepProfileDone) ? "box-shadow: 0 4px 20px rgba(13, 110, 253, 0.12)" : ""}" href="#/profile">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
              <div class="fw-semibold text-dark"><i class="bi bi-person-circle me-1"></i> 1. Профиль</div>
              <span class="badge ${stepProfileDone ? "text-bg-success" : "text-bg-primary"}">${stepProfileDone ? "✅ Заполнено" : "➕ Заполнить"}</span>
            </div>
            <div class="small text-muted">Укажите пол, возраст, рост и вес — это важно для точных рекомендаций.</div>
          </a>
        </div>
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 ${isOnboardingActive("genes", stepGeneDone) ? "border-primary" : "bg-white"} ${isOnboardingActive("genes", stepGeneDone) ? "" : "shadow-sm"}" style="${isOnboardingActive("genes", stepGeneDone) ? "box-shadow: 0 4px 20px rgba(13, 110, 253, 0.12)" : ""}" href="#/genotypes">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
              <div class="fw-semibold text-dark"><i class="bi bi-dna me-1"></i> 2. Генетика</div>
              <span class="badge ${stepGeneDone ? "text-bg-success" : "text-bg-primary"}">${stepGeneDone ? "✅ Заполнено" : "➕ Заполнить"}</span>
            </div>
            <div class="small text-muted">Внесите гены вручную или загрузите PDF — при необходимости поможет медсестра.</div>
          </a>
        </div>
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 ${isOnboardingActive("vitamins", stepVitDone) ? "border-primary" : "bg-white"} ${isOnboardingActive("vitamins", stepVitDone) ? "" : "shadow-sm"}" style="${isOnboardingActive("vitamins", stepVitDone) ? "box-shadow: 0 4px 20px rgba(13, 110, 253, 0.12)" : ""}" href="#/vitamins">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
              <div class="fw-semibold text-dark"><i class="bi bi-droplet me-1"></i> 3. Анализы</div>
              <span class="badge ${stepVitDone ? "text-bg-success" : "text-bg-primary"}">${stepVitDone ? "✅ Заполнено" : "➕ Заполнить"}</span>
            </div>
            <div class="small text-muted">Добавьте результаты анализов на витамины — система покажет дефицит/норму.</div>
          </a>
        </div>
      </div>
    </div>
  </div>`
      : "";

  const recTeaserHtml = topRecs.length
    ? topRecs
        .map((r) => {
          const st = recTeaserStyle(r._catKey);
          return `<a href="#/recommendations" class="d-block text-decoration-none text-body dash-rec-tease" style="border-left-color: ${st.border}">
        <div class="dash-rec-tease__cat text-${st.accent}">${escapeHtml(r._catLabel || "")}</div>
        <div class="fw-semibold small">${escapeHtml(r.title || "Рекомендация")}</div>
        <div class="text-muted small text-truncate">${escapeHtml((r.description || "").toString().slice(0, 100))}…</div>
      </a>`;
        })
        .join("")
    : `<p class="text-muted small mb-0">Персональные пункты появятся после внесения генотипов.</p>`;

  const feedHtml = activityItems.length
    ? activityItems
        .map((it) => {
          const ic = it.icon === "vit" ? "vit" : it.icon === "doc" ? "doc" : "dna";
          const cls = ic === "vit" ? "vit" : ic === "doc" ? "doc" : "";
          const ico = ic === "vit" ? "droplet" : ic === "doc" ? "chat-dots" : "diagram-2";
          return `<div class="dash-feed-item">
      <div class="dash-feed-ico dash-feed-ico--${cls}"><i class="bi bi-${ico}"></i></div>
      <div class="min-w-0">
        <div class="text-break">${escapeHtml(it.text)}</div>
        <div class="text-muted small">${escapeHtml(String(it.sub || ""))}${
        it.who ? ` · ${escapeHtml(it.who)}` : ""
      }</div>
      </div>
    </div>`;
        })
        .join("")
    : `<p class="text-muted small mb-0">События появятся при добавлении данных и комментариях врача.</p>`;

  const lastActivity = (() => {
    let b = 0;
    (genotypes || []).forEach((g) => {
      const x = g.updated_at || g.created_at;
      const n = x ? new Date(x).getTime() : 0;
      if (n > b) b = n;
    });
    (vitaminTests || []).forEach((v) => {
      const x = v.updated_at || v.created_at || v.test_date;
      const n = x ? new Date(x).getTime() : 0;
      if (n > b) b = n;
    });
    const vitMutationTs = readVitaminActivityTs(vitaminTests);
    if (vitMutationTs > b) b = vitMutationTs;
    if (patientProfile?.updated_at) {
      const n = new Date(patientProfile.updated_at).getTime();
      if (n > b) b = n;
    }
    if (!b) return "—";
    return new Date(b).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  })();

  const vitRowsH = (vitaminTests || [])
    .slice(0, 5)
    .map(
      (t) => `<tr>
      <td><div class="fw-medium">${escapeHtml(t.vitamin_name)}</div><div class="text-muted small">${escapeHtml(t.vitamin_unit_test || "")}</div></td>
      <td>${escapeHtml(String(t.test_value))}</td>
      <td>
        <div class="d-flex flex-wrap align-items-center gap-2">
          ${statusBadge(t.status)}
          <div class="progress flex-grow-1" style="height:0.45rem; min-width:4rem; max-width:9rem">
            <div class="progress-bar ${vitStatusToBarClass(t.status)}" style="width:${vitStatusToFillPercent(t.status)}%"></div>
          </div>
        </div>
      </td>
      <td class="text-nowrap text-muted small">${escapeHtml(formatDateRu(t.test_date))}</td>
    </tr>`,
    )
    .join("");

  const ctaGenedone = wellnessMode || genotypesCount > 0;
  const ctaVdone = vitaminTestsCount > 0;
  const ctaRecsDone = recItems > 0;

  const symptomCtaHtml =
    isPatient || isAdmin
      ? `<a href="#/symptom-test" class="dash-symptom-cta text-decoration-none text-body d-block rounded-3 position-relative overflow-hidden mb-3 mb-md-4 dashboard-animate" role="link" aria-label="Перейти к тесту по симптомам">
  <div class="d-flex flex-column flex-sm-row align-items-stretch">
    <div class="d-flex flex-grow-1 p-3 p-sm-4 gap-3">
      <div class="flex-shrink-0">
        <span class="dash-symptom-cta__icon d-inline-flex align-items-center justify-content-center rounded-3 text-white" aria-hidden="true">
          <i class="bi bi-clipboard2-pulse fs-2"></i>
        </span>
      </div>
      <div class="min-w-0">
        <div class="dash-symptom-cta__kicker text-uppercase small mb-1">4–5 минут</div>
        <h2 class="h5 mb-1 text-white">Тест по симптомам</h2>
        <p class="mb-0 small dash-symptom-cta__sub">Свяжем жалобы с витаминами и генетическими маркерами — ориентиры для обсуждения с врачом.</p>
      </div>
    </div>
    <div class="d-flex align-items-center justify-content-center px-3 py-3 py-sm-4 flex-shrink-0 dash-symptom-cta__action">
      <span class="btn btn-light btn-sm rounded-pill px-3">Перейти <i class="bi bi-arrow-right ms-1" aria-hidden="true"></i></span>
    </div>
  </div>
</a>`
      : "";

  const exportActionsHtml = showPatientPdf
    ? `<div class="card border-0 shadow-sm mb-3 mb-md-4 dashboard-animate" style="border-radius: 16px">
  <div class="card-body py-3 d-flex flex-wrap align-items-center justify-content-between gap-2 gap-md-3">
    <div class="small text-muted">
      <i class="bi bi-file-earmark-pdf me-1 text-primary" aria-hidden="true"></i>
      <span class="text-body fw-medium">PDF-отчёт</span> по данным кабинета
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="btn-download-report">
      <i class="bi bi-file-earmark-pdf me-1" aria-hidden="true"></i> Скачать PDF-отчёт
    </button>
  </div>
</div>`
    : "";

  const educationCtaHtml =
    isPatient || isAdmin
      ? `<div class="card border-0 shadow-sm mb-3 mb-md-4 dashboard-animate" style="border-radius: 16px">
  <div class="card-body py-3 py-md-4 d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3">
    <div>
      <div class="small text-uppercase text-muted mb-1" style="letter-spacing:0.05em">база знаний</div>
      <div class="fw-semibold mb-1"><i class="bi bi-journal-bookmark me-1 text-primary" aria-hidden="true"></i>Как хорошо вы знаете свой организм?</div>
      <div class="small text-muted">Углубите знания: почему это работает и как закрепить результат. Статьи, тесты и наглядные разборы.</div>
    </div>
    <a class="btn btn-outline-primary btn-sm" href="#/materials">Перейти к материалам</a>
  </div>
</div>`
      : "";

  const ctaBlock = `<div class="row g-2 g-md-3 mb-4">
    <div class="col-6 col-md-3 dashboard-animate">
      ${
        wellnessMode
          ? `<div class="dash-cta dash-cta--done opacity-80">
        <i class="bi bi-sun text-warning dash-cta__check"></i>
        <div class="text-muted text-uppercase mb-1" style="font-size:0.68rem">Wellness</div>
        <div class="fw-semibold">Без ввода ДНК</div>
        <div class="text-muted small mt-1">Гены скрыты в меню</div>
      </div>`
          : `<a class="dash-cta ${ctaGenedone ? "dash-cta--done" : ""}" href="#/genotypes">
        ${ctaGenedone ? '<i class="bi bi-check-circle-fill dash-cta__check" aria-hidden="true"></i>' : ""}
        <div class="text-primary text-uppercase mb-1" style="font-size:0.68rem">+ Гены</div>
        <div class="fw-semibold">Генетика</div>
        <div class="text-muted small mt-1">Варианты, PDF, заявка</div>
      </a>`
      }
    </div>
    <div class="col-6 col-md-3 dashboard-animate">
      <a class="dash-cta ${ctaRecsDone && recItems > 0 ? "dash-cta--done" : ""}" href="#/recommendations">
        ${recItems > 0 ? '<i class="bi bi-check-circle-fill dash-cta__check" aria-hidden="true"></i>' : ""}
        <div class="text-muted text-uppercase mb-1" style="font-size:0.68rem">Сводка</div>
        <div class="fw-semibold">Рекомендации</div>
        <div class="text-muted small mt-1"><span class="text-primary fw-medium">${recItems}</span> пунктов</div>
      </a>
    </div>
    <div class="col-6 col-md-3 dashboard-animate">
      <a class="dash-cta ${ctaVdone ? "dash-cta--done" : ""}" href="#/vitamins">
        ${ctaVdone ? '<i class="bi bi-check-circle-fill dash-cta__check" aria-hidden="true"></i>' : ""}
        <div class="text-info text-uppercase mb-1" style="font-size:0.68rem">+ Анализ</div>
        <div class="fw-semibold">Витамины</div>
        <div class="text-muted small mt-1">Внести показатели</div>
      </a>
    </div>
    <div class="col-6 col-md-3 dashboard-animate">
      <a class="dash-cta ${hasUpcomingAppt ? "dash-cta--done" : ""}" href="#/appointments">
        ${hasUpcomingAppt ? '<i class="bi bi-check-circle-fill dash-cta__check" aria-hidden="true"></i>' : ""}
        <div class="fw-semibold">Запись</div>
        <div class="text-muted small mt-1">Очный приём</div>
      </a>
    </div>
  </div>`;

  const hintBlock = showHintsCard
    ? `<div class="card border-0 shadow-sm mb-3 dashboard-animate">
    <div class="card-header bg-light border-0 small fw-semibold">Профиль</div>
    <div class="card-body py-3 small text-muted"><p class="mb-0">${
      wellnessMode
        ? 'Продолжайте вести <a href="#/vitamins">витамины</a>.'
        : profileHint || "Заполните данные в профиле."
    }</p></div>
  </div>`
    : "";

  const showChartCard =
    chartPayload && !chartPayload.needMore && (chartPayload.labels?.length || 0) >= 2;
  const needMoreName = chartPayload?.hintVitaminName
    ? ` по «${escapeHtml(chartPayload.hintVitaminName)}»`
    : "";
  const chartPlaceholder = chartPayload?.needMore
    ? `Добавьте <strong>ещё одно</strong> измерение${needMoreName} — на графике появятся линии динамики (до 3 витаминов).`
    : "Когда накопите несколько точек по витаминам, здесь отобразим кривые (до 3 витаминов с динамикой).";

  const stepperItems = wellnessMode
    ? [
        { key: "profile", label: "Профиль", icon: "bi-person-circle", done: stepProfileDone, href: "#/profile" },
        { key: "vitamins", label: "Витамины", icon: "bi-droplet", done: stepVitDone, href: "#/vitamins" },
        { key: "report", label: "Отчёт", icon: "bi-file-text", done: reportReady, href: "#/dashboard" },
      ]
    : [
        { key: "profile", label: "Профиль", icon: "bi-person-circle", done: stepProfileDone, href: "#/profile" },
        { key: "genes", label: "Генетика", icon: "bi-diagram-3", done: stepGeneDone, href: "#/genotypes" },
        { key: "vitamins", label: "Витамины", icon: "bi-droplet", done: stepVitDone, href: "#/vitamins" },
        { key: "report", label: "Отчёт", icon: "bi-file-text", done: reportReady, href: "#/dashboard" },
      ];
  const stepperHtml = `<div class="dash-stepper small">${stepperItems.map((s) => renderHeroStep(s)).join("")}</div>`;

  const emptyVit = !(vitaminTests && vitaminTests.length);
  const vitTableFooter =
    "";

  pageEl.innerHTML = `<div class="app-page app-dashboard">
    <style>
      .dash-step {
        border-radius: .7rem;
        padding: .2rem .25rem;
      }
      .dash-step__meta {
        font-size: .68rem;
        line-height: 1.2;
        color: #6c757d;
        min-height: .95rem;
      }
      .dash-step--done .dash-step__meta {
        color: #198754;
        font-weight: 600;
      }
      .dash-step__circle--report {
        border-radius: .45rem;
      }
      .dash-step--active {
        background: rgba(13, 110, 253, .08);
      }
      .dash-progress-wrap .progress-bar {
        transition: width .45s ease;
      }
      .dash-progress-caption {
        font-size: .78rem;
        color: #6c757d;
      }
    </style>
    <div class="dashboard-hero p-3 p-md-4 mb-3 mb-md-4 dashboard-animate">
      <div class="dashboard-hero-inner">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 gap-md-3">
          <div>
            <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
              <h1 class="h3 mb-0" style="letter-spacing:-0.02em">Здравствуйте, ${escapeHtml(patientDisplay || "—")}</h1>
            </div>
            <p class="text-muted small mb-0"><i class="bi bi-activity me-1 text-primary" aria-hidden="true"></i>Последняя активность: <strong class="text-body fw-medium">${lastActivity === "—" ? "—" : escapeHtml(lastActivity)}</strong></p>
          </div>
          <div class="d-none d-md-block text-end small">
          </div>
        </div>
        <div class="row g-3 align-items-stretch mt-1">
          <div class="col-12">
            <div class="small text-muted text-uppercase mb-1" style="font-size:0.68rem; letter-spacing:0.06em">Ваш прогресс в заполнении кабинета</div>
            <div class="dash-progress-caption mb-2">После заполнения вы получите персонализированный PDF-отчёт и рекомендации.</div>
            ${stepperHtml}
            <div class="mt-2 dash-progress-wrap">
              <div class="progress" style="height: 0.5rem; border-radius: 0.5rem">
                <div class="progress-bar ${progressBarClass}" style="width: ${fillPct}%"></div>
              </div>
              <div class="d-flex align-items-center justify-content-between gap-2 mt-1">
                <span class="small text-muted">Заполнено ${doneSectionsCount} из ${totalSectionsCount} разделов</span>
                <span class="small fw-semibold text-primary">${fillPct}%</span>
              </div>
              <div class="small text-muted mt-1">${escapeHtml(progressHint)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    ${notifHtml}
    ${remindersHtml}
    ${onboardingW}
    ${onboardingD}
    ${symptomCtaHtml}
    ${exportActionsHtml}
    <h2 class="h6 text-uppercase text-secondary mb-2" style="font-size:0.7rem; letter-spacing:0.05em">Ваша статистика</h2>
    <div class="row g-3 g-md-3 mb-4">
      <div class="col-6 col-sm-3 dashboard-animate">
        <div class="dash-metric h-100">
          <div class="d-flex align-items-center gap-2 gap-md-3">
            <div class="dash-ico text-primary bg-primary bg-opacity-10">
              <i class="bi bi-diagram-3" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-muted" style="font-size:0.8rem">Генотипы</div>
              <div class="fs-4 fw-bold lh-1 text-body">${genotypesCount}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-6 col-sm-3 dashboard-animate">
        <div class="dash-metric h-100">
          <div class="d-flex align-items-center gap-2 gap-md-3">
            <div class="dash-ico text-info bg-info bg-opacity-10">
              <i class="bi bi-droplet-half" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-muted" style="font-size:0.8rem">Анализы витаминов</div>
              <div class="fs-4 fw-bold lh-1 text-body">${vitaminTestsCount}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-6 col-sm-3 dashboard-animate">
        <div class="dash-metric h-100">
          <div class="d-flex align-items-center gap-2 gap-md-3">
            <div class="dash-ico text-success bg-success bg-opacity-10">
              <i class="bi bi-stars" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-muted" style="font-size:0.8rem">Рекомендации</div>
              <div class="fs-4 fw-bold lh-1 text-body">${recItems}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-6 col-sm-3 dashboard-animate">
        <div class="dash-metric h-100">
          <div class="d-flex flex-column h-100 justify-content-center small">
            <div class="text-muted mb-1" style="font-size:0.8rem">Статусы (витам.)</div>
            <div class="d-flex flex-wrap gap-1">
              <span class="badge text-bg-danger text-white">${deficiencyCount} деф.</span>
              <span class="badge text-bg-success">${normalCount} норм.</span>
              <span class="badge text-bg-warning text-dark">${proficitCount} изб.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <h2 class="h6 text-uppercase text-secondary mb-2" style="font-size:0.7rem; letter-spacing:0.05em">Быстрые действия</h2>
    ${ctaBlock}
    ${educationCtaHtml}
    <div class="row g-3">
      <div class="col-lg-7 dashboard-animate">
        <div class="card border-0 shadow-sm h-100" style="border-radius: 16px">
          <div class="card-header bg-light border-0 d-flex flex-wrap align-items-center justify-content-between">
            <span class="fw-semibold"><i class="bi bi-graph-up-arrow me-1 text-primary"></i> Динамика анализов</span>
            <a class="btn btn-sm btn-outline-primary" href="#/vitamins">Витамины</a>
          </div>
          <div class="card-body">
            <div class="d-flex align-items-end gap-1 mb-1 small text-info" style="min-height: 220px">
              ${
                showChartCard
                  ? '<canvas id="dashboard-vitamin-chart" class="w-100" style="min-height:200px;max-height:220px" aria-label="График динамики витаминов"></canvas>'
                  : `<p class="text-muted small mb-0 w-100">${chartPlaceholder}</p>`
              }
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-5 dashboard-animate">
        <div class="card border-0 shadow-sm h-100" style="border-radius: 16px">
          <div class="card-header bg-light border-0">
            <span class="fw-semibold"><i class="bi bi-lightbulb me-1 text-warning"></i> Сейчас в рекомендациях</span>
          </div>
          <div class="card-body small">${recTeaserHtml}
            <a class="d-inline-block btn btn-sm btn-primary mt-2" href="#/recommendations">Все рекомендации</a>
          </div>
        </div>
      </div>
    </div>
    <div class="card border-0 shadow-sm mt-3 mt-md-4 dashboard-animate" style="border-radius: 16px">
      <div class="card-header bg-light border-0 d-flex flex-wrap align-items-center justify-content-between">
        <span class="fw-semibold"><i class="bi bi-clock-history me-1" aria-hidden="true"></i> Активность</span>
      </div>
      <div class="card-body small pt-0">${feedHtml}</div>
    </div>
    <div class="row g-3 g-md-3 mt-1">
      <div class="col-12 dashboard-animate">
        <div class="card border-0 shadow-sm h-100" style="border-radius: 16px">
          <div class="card-header bg-light border-0 d-flex flex-wrap align-items-center justify-content-between">
            <span class="fw-semibold"><i class="bi bi-droplet me-1 text-info" aria-hidden="true"></i> Анализы (последние)</span>
            ${!emptyVit ? '<a class="btn btn-sm btn-link" href="#/vitamins">все</a>' : ""}
          </div>
          <div class="card-body p-0 p-md-0">
            ${
              emptyVit
                ? `<div class="text-center text-muted py-4 small"><i class="bi bi-droplet d-block fs-1 mb-2 opacity-50" aria-hidden="true"></i> Нет внесённых анализов<br><a class="btn btn-sm btn-primary mt-2" href="#/vitamins">Добавить</a></div>`
                : `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0"><thead class="table-light small"><tr><th>Витамин</th><th>Знач.</th><th>Статус</th><th>Дата</th></tr></thead><tbody id="dashboard-vitamin-tbody">${vitRowsH}${
                    vitaminTests.length > 5
                      ? '<tr><td colspan="4" class="text-center small border-0 pt-2"><a href="#/vitamins">Смотреть все</a></td></tr>'
                      : ""
                  }</tbody></table></div>`
            }
          </div>
          ${vitTableFooter}
        </div>
      </div>
    </div>
    ${wellnessMode ? "" : (isPatient && isEmpty && !showOnboarding ? `<div class="alert small border-0 my-2" style="background: rgba(13,110,253,0.07)"><a href="#/genotypes" class="alert-link fw-medium">Перейти к генетическим данным</a> — варианты, PDF, заявка, если нет гена</div>` : "")}
    <div class="row g-3 mt-2">
      <div class="col-12">
        <div class="dash-quote small mb-0 w-100">
          <i class="bi bi-quote me-1 text-primary opacity-50" aria-hidden="true"></i>
          <em>${escapeHtml(DASH_FOOTER_QUOTE.t)}</em>
          <div class="text-muted mt-2" style="font-size:0.8rem">— ${escapeHtml(DASH_FOOTER_QUOTE.a)}</div>
        </div>
      </div>
    </div>
    ${hintBlock}
  </div>`;

  if (isPatient || isAdmin) {
    requestAnimationFrame(() => {
      tryInitVitaminChart(pageEl, vitaminTests);
    });
  }

  const pushBtn = pageEl.querySelector("#btn-enable-push");
  if (pushBtn) {
    pushBtn.addEventListener("click", async () => {
      const r = await requestBrowserNotificationPermission();
      if (r === "granted") {
        showAlert("success", "Уведомления включены.");
      }
      pushBtn.closest(".alert")?.remove();
    });
  }
  const pdfB = pageEl.querySelector("#btn-download-report");
  if (pdfB) {
    pdfB.addEventListener("click", async () => {
      try {
        await api.patient.downloadReportPdf();
        showAlert("success", "PDF сохранён.");
      } catch (e) {
        showAlert("danger", e?.message);
      }
    });
  }
  const pdfInline = pageEl.querySelector("#btn-download-report-inline");
  if (pdfInline) {
    pdfInline.addEventListener("click", async () => {
      try {
        await api.patient.downloadReportPdf();
        showAlert("success", "PDF сохранён.");
      } catch (e) {
        showAlert("danger", e?.message);
      }
    });
  }
  pageEl.querySelectorAll('[data-action="done-reminder"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      const userRecId = Number(btn.getAttribute("data-user-rec-id"));
      if (!Number.isFinite(id) || !Number.isFinite(userRecId)) return;
      try {
        await api.push.updateUserSettings({
          user_recommendation_id: userRecId,
          status: "applied",
        });
        await api.patient.markNotificationsRead([id]);
        const box = btn.closest("[data-reminder-id]");
        if (box) box.remove();
        showAlert("success", "Отметили как выполнено.");
      } catch (e) {
        showAlert("danger", e?.message || "Не удалось обновить напоминание.");
      }
    });
  });
  pageEl.querySelectorAll('[data-action="open-reminder"]').forEach((link) => {
    link.addEventListener("click", async () => {
      const id = Number(link.getAttribute("data-id"));
      if (!Number.isFinite(id)) return;
      try {
        await api.patient.markNotificationsRead([id]);
      } catch {
        /* ignore */
      }
    });
  });
}
