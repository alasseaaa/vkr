import { getWithoutGeneticTestFlag } from "../services/wellness.js";

const CATEGORY_LABELS = {
  metabolism: "Метаболизм",
  sport: "Спорт",
  vitamins: "Витамины",
  nutrition: "Питание",
  wellness: "Общее здоровье",
};

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat || "—";
}

function safeExternalUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url, window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* ignore */
  }
  return null;
}

function articleParams(q, category) {
  const params = {};
  const t = (q || "").trim();
  if (t) params.q = t;
  if (category) params.category = category;
  return params;
}

function renderArticleCards(list) {
  if (!list.length) {
    return `<div class="col-12"><div class="alert alert-light border text-muted mb-0">Ничего не найдено. Измените запрос или сбросьте фильтры.</div></div>`;
  }
  return list
    .map(
      (a) => `
    <div class="col-md-6 col-lg-4">
      <div class="card app-card shadow-sm h-100">
        <div class="card-body d-flex flex-column">
          <div class="mb-2">
            <span class="badge bg-secondary">${escapeHtml(categoryLabel(a.category))}</span>
            ${a.created_at ? `<span class="text-muted small ms-2">${String(a.created_at).slice(0, 10)}</span>` : ""}
          </div>
          <h2 class="h6 fw-semibold mb-2">${escapeHtml(a.title)}</h2>
          ${a.author ? `<div class="text-muted small mb-2">${escapeHtml(a.author)}</div>` : ""}
          <p class="text-muted small flex-grow-1 mb-3" style="display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml((a.content || "").replace(/\s+/g, " ").slice(0, 220))}${(a.content || "").length > 220 ? "…" : ""}
          </p>
          <a class="btn btn-outline-primary btn-sm mt-auto align-self-start" href="#/articles/${a.id}">Читать</a>
        </div>
      </div>
    </div>`,
    )
    .join("");
}

async function renderList(pageEl, { api, showAlert, auth }) {
  pageEl.innerHTML = `<div class="app-page"><p class="text-muted">Загрузка статей…</p></div>`;

  const mount = (list, state) => {
    const { q, category, showWellnessHint } = state;
    pageEl.innerHTML = `
      <div class="app-page">
        <div class="app-page-header d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h1 class="app-page-title h3 mb-1">Статьи</h1>
            <p class="text-muted small mb-0">Материалы доступны без входа. Поиск по названию и тексту.</p>
          </div>
          <div class="d-flex flex-wrap gap-2 align-items-center">
            <a href="#/myth-truth" class="btn btn-outline-secondary btn-sm"><i class="bi bi-patch-question me-1"></i>Миф или правда?</a>
            ${auth?.basicToken ? "" : `<a href="#/login" class="btn btn-outline-primary btn-sm">Войти</a>`}
          </div>
        </div>

        ${
          showWellnessHint
            ? `<div id="articles-wellness-hint" class="alert alert-success border-0 bg-success bg-opacity-10 small mb-3">
                По умолчанию показана категория «Общее здоровье» — материалы без опоры на генетический тест. Выберите «Все категории» или сброс, чтобы увидеть весь каталог.
              </div>`
            : ""
        }

        <div class="row g-3 mb-4">
          <div class="col-lg-6">
            <div class="card app-card border-0 shadow-sm bg-primary bg-opacity-10">
              <div class="card-body">
                <div class="fw-semibold text-primary mb-1"><i class="bi bi-journal-text me-2"></i>Научно-популярные материалы</div>
                <p class="small text-muted mb-0">Подборка статей по метаболизму, витаминам, спорту и питанию — с указанием категории и даты.</p>
              </div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="card app-card border-0 shadow-sm">
              <div class="card-body">
                <div class="fw-semibold mb-1"><i class="bi bi-funnel me-2"></i>Фильтры и поиск</div>
                <p class="small text-muted mb-0">Введите слово в поле поиска — ищем и в заголовке, и в тексте. Категорию можно сузить отдельным списком.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="card app-card shadow-sm mb-4">
          <div class="card-body">
            <div class="row g-2 align-items-end">
              <div class="col-md-5">
                <label class="form-label small mb-1">Поиск</label>
                <input type="search" id="articles-q" class="form-control" placeholder="Название или фрагмент текста…" value="${escapeHtml(q)}" autocomplete="off" />
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1">Категория</label>
                <select id="articles-cat" class="form-select">
                  <option value="">Все категории</option>
                  ${Object.entries(CATEGORY_LABELS)
                    .map(
                      ([k, lab]) =>
                        `<option value="${k}" ${category === k ? "selected" : ""}>${escapeHtml(lab)}</option>`,
                    )
                    .join("")}
                </select>
              </div>
              <div class="col-md-3 d-flex gap-2">
                <button type="button" class="btn btn-primary flex-grow-1" id="articles-apply">Найти</button>
                <button type="button" class="btn btn-outline-secondary" id="articles-reset" title="Сбросить">Сброс</button>
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="text-muted small">Найдено: <strong id="articles-count">${list.length}</strong></span>
        </div>
        <div class="row g-3" id="articles-grid">
          ${renderArticleCards(list)}
        </div>
      </div>
    `;

    const qEl = pageEl.querySelector("#articles-q");
    const catEl = pageEl.querySelector("#articles-cat");
    const gridEl = pageEl.querySelector("#articles-grid");

    const runFetch = async () => {
      const st = { q: qEl.value, category: catEl.value };
      gridEl.innerHTML = `<div class="col-12 text-muted py-4">Загрузка…</div>`;
      try {
        let next = await api.public.listArticles(articleParams(st.q, st.category));
        if (!Array.isArray(next)) next = [];
        gridEl.innerHTML = renderArticleCards(next);
        const cnt = pageEl.querySelector("#articles-count");
        if (cnt) cnt.textContent = String(next.length);
      } catch (err) {
        showAlert("danger", err.message);
        gridEl.innerHTML = `<div class="col-12"><div class="alert alert-danger">${escapeHtml(err.message)}</div></div>`;
      }
    };

    let debounce;
    qEl.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(runFetch, 450);
    });
    catEl.addEventListener("change", () => {
      pageEl.querySelector("#articles-wellness-hint")?.remove();
      runFetch();
    });
    pageEl.querySelector("#articles-apply").addEventListener("click", runFetch);
    pageEl.querySelector("#articles-reset").addEventListener("click", () => {
      qEl.value = "";
      catEl.value = "";
      pageEl.querySelector("#articles-wellness-hint")?.remove();
      runFetch();
    });
  };

  try {
    const defaultWellness =
      auth?.role === "patient" && getWithoutGeneticTestFlag() ? "wellness" : "";
    let list = await api.public.listArticles(articleParams("", defaultWellness));
    if (!Array.isArray(list)) list = [];
    mount(list, {
      q: "",
      category: defaultWellness,
      showWellnessHint: Boolean(defaultWellness),
    });
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="app-page"><div class="alert alert-danger">${escapeHtml(err.message)}</div></div>`;
  }
}

async function renderDetail(pageEl, { api, route, showAlert }) {
  const id = route.articleId;
  pageEl.innerHTML = `<div class="app-page"><p class="text-muted">Загрузка…</p></div>`;
  try {
    const a = await api.public.getArticle(id);
    const sourceHref = safeExternalUrl(a.source_url);
    pageEl.innerHTML = `
      <div class="app-page">
        <div class="mb-3">
          <a href="#/articles" class="btn btn-outline-secondary btn-sm">← К списку статей</a>
        </div>
        <article class="card app-card shadow-sm">
          <div class="card-body">
            <h1 class="h4 mb-2">${escapeHtml(a.title)}</h1>
            <div class="d-flex flex-wrap gap-2 align-items-center text-muted small mb-3">
              <span class="badge bg-secondary">${escapeHtml(categoryLabel(a.category))}</span>
              <span>${a.created_at ? String(a.created_at).slice(0, 10) : ""}</span>
              ${a.author ? `<span>${escapeHtml(a.author)}</span>` : ""}
              ${a.gene_symbol ? `<span>Ген: ${escapeHtml(a.gene_symbol)}</span>` : ""}
            </div>
            <div class="article-body border-top pt-3" style="white-space: pre-wrap;">${escapeHtml(a.content)}</div>
            ${sourceHref ? `<p class="mt-3 mb-0"><a href="${sourceHref}" target="_blank" rel="noopener noreferrer">Источник</a></p>` : ""}
          </div>
        </article>
      </div>
    `;
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="app-page"><div class="alert alert-danger">${escapeHtml(err.message)}</div><a href="#/articles" class="btn btn-outline-secondary btn-sm">К списку</a></div>`;
  }
}

export async function render(pageEl, ctx) {
  if (ctx.route?.name === "article-detail") {
    await renderDetail(pageEl, ctx);
  } else {
    await renderList(pageEl, ctx);
  }
}
