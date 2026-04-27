import { requestBrowserNotificationPermission } from "../services/patientNotifications.js";

const KEY_JUST_REGISTERED = "genapp_just_registered";
const KEY_LAST_VISIT = "genapp_dashboard_last_visit";

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
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    sessionStorage.setItem(KEY_LAST_VISIT, new Date().toISOString());
  } catch {
    /* */
  }
  return previousLabel;
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
      ? x.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
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
    const t = g.created_at ? new Date(g.created_at).getTime() : 0;
    if (!t) return;
    items.push({
      t,
      icon: "dna",
      text: `Генотип: ${(g.gene_symbol || "ген").toString()}`,
      sub: g.created_at,
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
      sub: v.test_date,
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
      sub: c.created_at || "—",
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

  const [genotypes, vitaminTests, recommendations, comments, appointments] = await Promise.all([
    api.patient.listGenotypes(),
    api.patient.listVitaminTests(),
    api.patient.getRecommendations().catch(() => null),
    (isPatient || isAdmin
      ? api.comments.list().catch(() => [])
      : Promise.resolve([])) || Promise.resolve([]),
    (isPatient || isAdmin
      ? api.patient.listAppointments().catch(() => [])
      : Promise.resolve([])) || Promise.resolve([]),
  ]);

  const commentList = Array.isArray(comments) ? comments : comments?.results || [];
  const apptList = Array.isArray(appointments) ? appointments : [];
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
  const lastVisitLabel = readAndUpdateLastVisit();

  if (isPatient || isAdmin) {
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
  const passportStatus = wellnessMode ? "Не используется" : genotypesCount > 0 ? "Заполнен" : "Пусто";

  const notifHtml =
    isPatient &&
    typeof Notification !== "undefined" &&
    Notification.permission === "default"
      ? `<div class="alert alert-primary border-0 py-2 px-3 mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2 dashboard-animate">
      <span class="small mb-0">Ответы врача: разрешите <strong>уведомления</strong> браузера.</span>
      <button type="button" class="btn btn-sm btn-light" id="btn-enable-push">Разрешить</button>
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
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 bg-white shadow-sm" href="#/vitamin-tests">
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
      ? `<div class="card border-0 shadow-sm mb-3 dashboard-animate" style="background: linear-gradient(180deg, #f0f4ff 0%, #fff 100%)">
    <div class="card-body p-4">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        ${justRegistered ? `<span class="badge text-bg-success">Добро пожаловать</span>` : ""}
        <h2 class="h5 mb-0">${justRegistered ? "Старт: 3 шага" : "Начните с данных"}</h2>
      </div>
      <p class="text-muted small">Профиль → <strong>гены</strong> (или PDF) → <strong>витамины</strong>.</p>
      <div class="row g-3 mt-1">
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 bg-white shadow-sm" href="#/profile">1. Профиль</a>
        </div>
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 border-primary" style="box-shadow: 0 4px 20px rgba(13, 110, 253, 0.12)" href="#/genotypes">2. Генетика</a>
        </div>
        <div class="col-md-4">
          <a class="d-block text-decoration-none rounded-3 border p-3 h-100 bg-white shadow-sm" href="#/vitamin-tests">3. Витамины</a>
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
      const n = v.test_date ? new Date(v.test_date).getTime() : 0;
      if (n > b) b = n;
    });
    if (patientProfile?.updated_at) {
      const n = new Date(patientProfile.updated_at).getTime();
      if (n > b) b = n;
    }
    if (!b) return "—";
    return new Date(b).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
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
      <td class="text-nowrap text-muted small">${escapeHtml(String(t.test_date))}</td>
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
      <a class="dash-cta ${ctaVdone ? "dash-cta--done" : ""}" href="#/vitamin-tests">
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
        ? 'Продолжайте вести <a href="#/vitamin-tests">витамины</a>.'
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

  const leadLine = isPatient
    ? justRegistered
      ? "Добро пожаловать. Ниже — путь к полноценному отчёту."
      : "Сводка: профиль, маркеры и витамины в одном месте."
    : isAdmin
      ? "Просмотр в режиме, близком к кабинету пациента."
      : "";

  const stepperHtml = wellnessMode
    ? `<div class="dash-stepper small">
      <div class="dash-step ${stepProfileDone ? "dash-step--done" : "dash-step--active"}">
        <div class="dash-step__circle">1</div>
        <div class="dash-step__label">Профиль</div>
      </div>
      <div class="dash-step ${ctaVdone ? "dash-step--done" : "dash-step--active"}">
        <div class="dash-step__circle">2</div>
        <div class="dash-step__label">Витамины</div>
      </div>
    </div>`
    : `<div class="dash-stepper small">
      <div class="dash-step ${stepProfileDone ? "dash-step--done" : "dash-step--active"}">
        <div class="dash-step__circle">1</div>
        <div class="dash-step__label">Профиль</div>
      </div>
      <div class="dash-step ${stepGeneDone ? "dash-step--done" : "dash-step--active"}">
        <div class="dash-step__circle">2</div>
        <div class="dash-step__label">Генотипы</div>
      </div>
      <div class="dash-step ${stepVitDone ? "dash-step--done" : "dash-step--active"}">
        <div class="dash-step__circle">3</div>
        <div class="dash-step__label">Витамины</div>
      </div>
      <div class="dash-step ${fillPct >= 100 ? "dash-step--done" : ""}">
        <div class="dash-step__circle">✓</div>
        <div class="dash-step__label">Отчёт</div>
      </div>
    </div>`;

  const emptyVit = !(vitaminTests && vitaminTests.length);
  const vitTableFooter =
    isPatient || isAdmin
      ? `<div class="card-footer bg-white border-0 border-top small py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
      <span class="text-muted me-auto">Полезное</span>
      <div>
        <a class="me-3" href="#/myth-truth">Миф или правда</a>
        <a href="#/articles">Материалы</a>
      </div>
    </div>`
      : "";

  pageEl.innerHTML = `<div class="app-page app-dashboard">
    <div class="dashboard-hero p-3 p-md-4 mb-3 mb-md-4 dashboard-animate">
      <div class="dashboard-hero-inner">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 gap-md-3">
          <div>
            <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
              <h1 class="h3 mb-0" style="letter-spacing:-0.02em">Здравствуйте, ${escapeHtml(patientDisplay || "—")}</h1>
              <span class="badge text-bg-light border text-secondary"><i class="bi bi-shield-lock me-1"></i>кабинет</span>
            </div>
            <p class="text-muted small mb-1"><i class="bi bi-clock-history me-1" aria-hidden="true"></i>Предыдущий визит: <span class="text-body">${escapeHtml(lastVisitLabel)}</span> · <a href="#/profile" class="text-decoration-none">профиль</a></p>
            <p class="text-muted small mb-0"><i class="bi bi-activity me-1 text-primary" aria-hidden="true"></i>Актуальные данные: <strong class="text-body fw-medium">${lastActivity === "—" ? "—" : escapeHtml(lastActivity)}</strong></p>
          </div>
          <div class="d-none d-md-block text-end small text-secondary">
            <i class="bi bi-lock-fill text-success" title="HTTPS" aria-hidden="true"></i> соединение защищено
          </div>
        </div>
        <div class="row g-3 align-items-stretch mt-1">
          <div class="col-12 col-lg-5">
            <div class="small text-muted text-uppercase mb-1" style="font-size:0.68rem; letter-spacing:0.06em">Сборка отчёта</div>
            <div class="d-flex align-items-center gap-2">
              <div class="flex-grow-1" style="max-width: 14rem">
                <div class="progress" style="height: 0.5rem; border-radius: 0.5rem">
                  <div class="progress-bar ${fillPct >= 100 ? "bg-success" : "bg-primary"}" style="width: ${fillPct}%"></div>
                </div>
              </div>
              <span class="small fw-semibold text-primary">${fillPct}%</span>
            </div>
            ${stepperHtml}
          </div>
          <div class="col-12 col-lg-7 text-lg-end small">
            <div>Рекомендации: <span class="fw-medium text-body">${recItems}</span> в <span class="text-body fw-medium">${recCats}</span> раздел.</div>
            <div class="text-muted">Паспорт (ДНК): <span class="text-body">${escapeHtml(passportStatus)}</span></div>
          </div>
        </div>
        <p class="text-secondary small mt-2 mb-0"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>${escapeHtml(leadLine)}</p>
      </div>
    </div>
    ${notifHtml}
    ${onboardingW}
    ${onboardingD}
    ${symptomCtaHtml}
    ${exportActionsHtml}
    <div class="row g-3 g-md-3 mb-4">
      <div class="col-6 col-sm-3 dashboard-animate">
        <div class="dash-metric h-100">
          <div class="d-flex align-items-center gap-2 gap-md-3">
            <div class="dash-ico text-primary bg-primary bg-opacity-10">
              <i class="bi bi-diagram-2-fill" aria-hidden="true"></i>
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
    <div class="row g-3">
      <div class="col-lg-7 dashboard-animate">
        <div class="card border-0 shadow-sm h-100" style="border-radius: 16px">
          <div class="card-header bg-light border-0 d-flex flex-wrap align-items-center justify-content-between">
            <span class="fw-semibold"><i class="bi bi-graph-up-arrow me-1 text-primary"></i> Динамика витаминов</span>
            <a class="btn btn-sm btn-outline-primary" href="#/vitamin-tests">Витамины</a>
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
            ${!emptyVit ? '<a class="btn btn-sm btn-link" href="#/vitamin-tests">все</a>' : ""}
          </div>
          <div class="card-body p-0 p-md-0">
            ${
              emptyVit
                ? `<div class="text-center text-muted py-4 small"><i class="bi bi-droplet d-block fs-1 mb-2 opacity-50" aria-hidden="true"></i> Нет внесённых анализов<br><a class="btn btn-sm btn-primary mt-2" href="#/vitamin-tests">Добавить</a></div>`
                : `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0"><thead class="table-light small"><tr><th>Витамин</th><th>Знач.</th><th>Статус</th><th>Дата</th></tr></thead><tbody id="dashboard-vitamin-tbody">${vitRowsH}${
                    vitaminTests.length > 5
                      ? '<tr><td colspan="4" class="text-center small border-0 pt-2"><a href="#/vitamin-tests">Смотреть все</a></td></tr>'
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
      if (r === "granted") showAlert("success", "Уведомления включены.");
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
}
