import { getWithoutGeneticTestFlag } from "../services/wellness.js";

const CATEGORY_META = {
  sport: { label: "Спорт", colorClass: "primary", borderClass: "border-primary", icon: "bi-activity" },
  vitamins: { label: "Витамины", colorClass: "warning", borderClass: "border-warning", icon: "bi-capsule" },
  nutrition: { label: "Питание", colorClass: "success", borderClass: "border-success", icon: "bi-egg-fried" },
  general: { label: "Общее", colorClass: "secondary", borderClass: "border-secondary", icon: "bi-info-circle" },
  skincare: { label: "Кожа", colorClass: "info", borderClass: "border-info", icon: "bi-droplet" },
  hair: { label: "Волосы", colorClass: "dark", borderClass: "border-dark", icon: "bi-scissors" },
  longevity: {
    label: "Долголетие",
    colorClass: "teal",
    borderClass: "border-teal",
    icon: "bi-tree-fill",
    hex: "#20c997",
  },
  circadian: {
    label: "Режим / сон",
    colorClass: "indigo",
    borderClass: "border-indigo",
    icon: "bi-moon-stars",
    hex: "#6610f2",
  },
  hormones: {
    label: "Гормоны",
    colorClass: "purple",
    borderClass: "border-purple",
    icon: "bi-graph-up",
    hex: "#6f42c1",
  },
  detox: {
    label: "Детокс / антиоксиданты",
    colorClass: "green",
    borderClass: "border-green",
    icon: "bi-flower1",
    hex: "#28a745",
  },
  bones: { label: "Кости / кальций", colorClass: "cyan", borderClass: "border-cyan", icon: "bi-bone", hex: "#0dcaf0" },
  metabolism: { label: "Метаболизм", colorClass: "orange", borderClass: "border-orange", icon: "bi-fire", hex: "#fd7e14" },
};

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function recUid(auth, catKey, rec, idx) {
  const user = auth?.username || "anon";
  const base = rec?.id ?? `${rec?.title || "rec"}_${idx}`;
  return `${user}|${catKey}|${base}`;
}

function localJsonGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function localJsonSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function getMeta(catKey, apiCat) {
  const base = CATEGORY_META[catKey] || {};
  return {
    label: base.label || apiCat?.label || catKey,
    colorClass: base.colorClass || "primary",
    borderClass: base.borderClass || "border-primary",
    icon: base.icon || "bi-tag",
  };
}

function recommendationScore(rec) {
  if (typeof rec.priority === "number") return rec.priority;
  if (rec.priority === "high") return 300;
  if (rec.priority === "medium") return 200;
  if (rec.priority === "low") return 100;
  if ((rec.genes || []).length) return 50 + (rec.genes || []).length;
  return 0;
}

function normalizeAndFilter(rawCats, categoryKey, q, onlyFav, favSet, auth) {
  const txt = String(q || "").trim().toLowerCase();
  const out = {};
  for (const [catKey, apiCat] of Object.entries(rawCats || {})) {
    if (categoryKey && categoryKey !== catKey) continue;
    const recs = (apiCat.recommendations || [])
      .map((rec, idx) => {
        const uid = recUid(auth, catKey, rec, idx);
        const merged = { ...rec, _uid: uid, _catKey: catKey };
        return merged;
      })
      .filter((rec) => {
        if (onlyFav && !favSet.has(rec._uid)) return false;
        if (!txt) return true;
        const blob = `${rec.title || ""} ${rec.description || ""} ${(rec.genes || []).join(" ")}`.toLowerCase();
        return blob.includes(txt);
      })
      .sort((a, b) => recommendationScore(b) - recommendationScore(a));
    if (recs.length) out[catKey] = { ...apiCat, recommendations: recs };
  }
  return out;
}

function categorySort(a, b) {
  const ka = String(a[0] || "").toLowerCase();
  const kb = String(b[0] || "").toLowerCase();
  const la = getMeta(ka, a[1]).label.toLowerCase();
  const lb = getMeta(kb, b[1]).label.toLowerCase();
  return la.localeCompare(lb, "ru");
}

function renderSkeleton() {
  const block = Array.from({ length: 3 })
    .map(
      () => `
      <section class="card app-card shadow-sm mb-3 rec-skeleton">
        <div class="card-header bg-light">
          <div class="placeholder-glow"><span class="placeholder col-4"></span></div>
        </div>
        <div class="card-body">
          <div class="placeholder-glow mb-2"><span class="placeholder col-7"></span></div>
          <div class="placeholder-glow mb-2"><span class="placeholder col-10"></span></div>
          <div class="placeholder-glow"><span class="placeholder col-8"></span></div>
        </div>
      </section>`,
    )
    .join("");
  return `<div class="app-page">${block}</div>`;
}

function renderEmptyState(withFilters) {
  if (withFilters) {
    return `<div class="alert alert-info border-0 bg-info bg-opacity-10">По текущему фильтру рекомендаций не найдено.</div>`;
  }
  return `
    <div class="card app-card border-0 shadow-sm">
      <div class="card-body">
        <h2 class="h5 mb-2">🧬 У вас пока нет рекомендаций</h2>
        <p class="text-muted small mb-2">Вот что можно сделать:</p>
        <ol class="small mb-0">
          <li>Добавить генетические данные → <a href="#/genotypes">Мои гены</a></li>
          <li>Добавить анализы витаминов → <a href="#/vitamin-tests">Анализы витаминов</a></li>
          <li>Пройти тест по симптомам → <a href="#/symptom-test">Тест по симптомам</a></li>
        </ol>
      </div>
    </div>`;
}

function renderCategories(categories, favSet) {
  const entries = Object.entries(categories || {}).sort(categorySort);
  return entries
    .map(([catKey, cat]) => {
      const meta = getMeta(catKey, cat);
      const badgeCls = `text-bg-${meta.colorClass}`;
      return `
      <section class="rec-category card app-card shadow-sm mb-4 border-start border-4 ${meta.borderClass}">
        <div class="card-header bg-light py-2 d-flex align-items-center justify-content-between">
          <h2 class="h6 mb-0 fw-semibold d-flex align-items-center gap-2">
            <i class="bi ${meta.icon} text-${meta.colorClass}"></i>
            ${escapeHtml(meta.label)}
          </h2>
          <span class="badge ${badgeCls}">${(cat.recommendations || []).length}</span>
        </div>
        <div class="card-body pt-2">
          ${(cat.recommendations || [])
            .map((rec, idx, arr) => {
              const isFav = favSet.has(rec._uid);
              return `
                <article class="rec-item py-3 ${idx < arr.length - 1 ? "border-bottom" : ""}" data-rec-uid="${escapeHtml(rec._uid)}">
                  <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div>
                      <div class="fw-semibold text-dark">${escapeHtml(rec.title || "")}</div>
                      <div class="text-muted small mt-1">${rec.genes?.length ? `Маркеры: ${escapeHtml(rec.genes.join(", "))}` : ""}</div>
                    </div>
                    <button type="button" class="btn btn-sm ${isFav ? "btn-warning" : "btn-outline-warning"} py-0 px-2" data-action="fav" data-rec-uid="${escapeHtml(rec._uid)}" title="Добавить в избранное">
                      <i class="bi ${isFav ? "bi-star-fill" : "bi-star"}"></i>
                    </button>
                  </div>
                  <div class="rec-description text-body" style="white-space: pre-wrap;">${escapeHtml(rec.description || "")}</div>
                </article>`;
            })
            .join("")}
        </div>
      </section>`;
    })
    .join("");
}

export async function render(pageEl, { api, showAlert, auth }) {
  pageEl.innerHTML = renderSkeleton();

  const favStorageKey = `rec_favorites_${auth?.username || "anon"}`;
  const favSet = new Set(localJsonGet(favStorageKey, []));

  try {
    const data = await api.patient.getRecommendations();
    const raw = data?.categories || {};

    const catOptions = Object.entries(raw)
      .sort(categorySort)
      .map(([key, cat]) => {
        const label = getMeta(key, cat).label;
        return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    const recWellnessHint =
      auth?.role === "patient" && getWithoutGeneticTestFlag()
        ? `<div class="alert alert-light border small mb-3">Персональные рекомендации по генотипам появятся после добавления вариантов в разделе «Мои гены» (его можно открыть по ссылке из <a href="#/profile">профиля</a>, если отключите режим без теста).</div>`
        : "";

    pageEl.innerHTML = `
      <style>
        .rec-skeleton .placeholder { animation: recPulse 1.4s ease-in-out infinite; }
        .border-teal { border-color: #20c997 !important; } .text-teal { color:#20c997 !important; } .text-bg-teal { background:#20c997 !important; color:#fff !important; }
        .border-indigo { border-color:#6610f2 !important; } .text-indigo { color:#6610f2 !important; } .text-bg-indigo { background:#6610f2 !important; color:#fff !important; }
        .border-purple { border-color:#6f42c1 !important; } .text-purple { color:#6f42c1 !important; } .text-bg-purple { background:#6f42c1 !important; color:#fff !important; }
        .border-green { border-color:#28a745 !important; } .text-green { color:#28a745 !important; } .text-bg-green { background:#28a745 !important; color:#fff !important; }
        .border-cyan { border-color:#0dcaf0 !important; } .text-cyan { color:#0dcaf0 !important; } .text-bg-cyan { background:#0dcaf0 !important; color:#052c3a !important; }
        .border-orange { border-color:#fd7e14 !important; } .text-orange { color:#fd7e14 !important; } .text-bg-orange { background:#fd7e14 !important; color:#fff !important; }
        .rec-item {
          background: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.06);
          border-radius: 0.7rem;
          padding: 1rem !important;
          transition: box-shadow .18s ease, background-color .18s ease;
        }
        .rec-item:hover {
          background: #ffffff;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
        }
        .rec-description {
          font-size: 0.97rem;
          line-height: 1.58;
          color: #1f2937;
        }
        @keyframes recPulse { 0%,100% { opacity:0.5; } 50% { opacity:0.95; } }
      </style>
      <div class="app-page">
        ${recWellnessHint}
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <h3 class="mb-0">Рекомендации</h3>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <a class="btn btn-outline-secondary btn-sm" href="#/dashboard">На дашборд</a>
          </div>
        </div>

        <div class="card app-card shadow-sm mb-3">
          <div class="card-body">
            <div class="row g-2 align-items-end">
              <div class="col-md-4">
                <label class="form-label small mb-1">Категория</label>
                <select id="rec-category" class="form-select">
                  <option value="">Все категории</option>
                  ${catOptions}
                </select>
              </div>
              <div class="col-md-5">
                <label class="form-label small mb-1">Поиск по тексту</label>
                <input type="search" id="rec-search" class="form-control" placeholder="Заголовок, описание или ген…" autocomplete="off" />
              </div>
              <div class="col-md-3">
                <div class="form-check form-switch mt-md-4 pt-md-1">
                  <input class="form-check-input" type="checkbox" id="rec-only-fav">
                  <label class="form-check-label small" for="rec-only-fav">Только избранные</label>
                </div>
              </div>
            </div>
            <div class="small text-muted mt-2" id="rec-found"></div>
          </div>
        </div>

        <div id="rec-mount"></div>
      </div>
    `;

    const mount = pageEl.querySelector("#rec-mount");
    const foundEl = pageEl.querySelector("#rec-found");
    const searchEl = pageEl.querySelector("#rec-search");
    const catEl = pageEl.querySelector("#rec-category");
    const onlyFavEl = pageEl.querySelector("#rec-only-fav");

    const paint = () => {
      if (!Object.keys(raw).length) {
        mount.innerHTML = renderEmptyState(false);
        foundEl.textContent = "Найдено: 0 рекомендаций в 0 категориях";
        return;
      }
      const filtered = normalizeAndFilter(
        raw,
        catEl.value,
        searchEl.value,
        Boolean(onlyFavEl.checked),
        favSet,
        auth,
      );
      const entries = Object.entries(filtered);
      const recCount = entries.reduce((acc, [, c]) => acc + (c.recommendations || []).length, 0);
      const catCount = entries.length;
      foundEl.textContent = `Найдено: ${recCount} рекомендаций в ${catCount} категориях`;
      if (!recCount) {
        const hasFilters = Boolean(catEl.value || searchEl.value.trim() || onlyFavEl.checked);
        mount.innerHTML = renderEmptyState(hasFilters);
        return;
      }
      mount.innerHTML = renderCategories(filtered, favSet);
    };

    paint();

    mount.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;
      const uid = btn.getAttribute("data-rec-uid");
      if (!uid) return;
      const action = btn.getAttribute("data-action");
      if (action === "fav") {
        if (favSet.has(uid)) favSet.delete(uid);
        else favSet.add(uid);
        localJsonSet(favStorageKey, [...favSet]);
        paint();
        return;
      }
    });

    let debounce;
    searchEl.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(paint, 220);
    });
    catEl.addEventListener("change", paint);
    onlyFavEl.addEventListener("change", paint);
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}
