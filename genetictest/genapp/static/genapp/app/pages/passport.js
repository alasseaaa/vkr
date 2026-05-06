import { doctorCommentsForMarkerHtml } from "../components/doctorComment.js?v=3";
import { getWithoutGeneticTestFlag } from "../services/wellness.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function riskLabel(r) {
  const m = { low: "Низкий", medium: "Средний", high: "Высокий" };
  return m[r] || r || "—";
}

function textBlockCompact(title, text) {
  const t = (text || "").trim();
  if (!t) return "";
  return `
    <div class="mb-2 pb-2 border-bottom border-light">
      <div class="text-muted text-uppercase fw-semibold mb-1" style="font-size: 0.68rem; letter-spacing: 0.04em;">${escapeHtml(title)}</div>
      <div class="small text-body" style="white-space: pre-wrap; line-height: 1.45;">${escapeHtml(t)}</div>
    </div>`;
}

function oneLinePreview(text, max = 100) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function paginate(list, page, pageSize) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), total, pages, page: safePage };
}

export async function render(pageEl, { api, showAlert, route }) {
  pageEl.innerHTML = `<div class="card"><div class="card-body">Формирование паспорта...</div></div>`;

  try {
    const [genotypes, allCommentsRaw] = await Promise.all([
      api.patient.listGenotypes(),
      api.comments.list({}).catch(() => []),
    ]);
    const list = Array.isArray(genotypes) ? genotypes : [];
    const allComments = Array.isArray(allCommentsRaw) ? allCommentsRaw : [];

    const byGenotype = new Map();
    for (const c of allComments) {
      const gid = c.genetic_result_id;
      if (gid == null) continue;
      const k = Number(gid);
      if (!byGenotype.has(k)) byGenotype.set(k, []);
      byGenotype.get(k).push(c);
    }

    let page = 1;
    const PAGE_SIZE = 8;
    const renderCards = (src) => {
      const pg = paginate(src, page, PAGE_SIZE);
      const cards =
        src.length === 0
          ? `<div class="alert alert-light border text-muted">Нет сохранённых генотипов. Добавьте данные в разделе «Генетические данные».</div>`
          : pg.items
            .map((g) => {
              const sym = escapeHtml((g.gene_symbol || "").trim() || "—");
              const fullName = (g.gene_full_name || "").trim();
              const titleTip = fullName ? escapeHtml(fullName) : "";
              const variant = escapeHtml(g.variant_genotype || "—");
              const markerComments = byGenotype.get(Number(g.id)) || [];
              const hasDoctorComment = markerComments.length > 0;
              const doctorBlocks = doctorCommentsForMarkerHtml(
                markerComments,
                "Комментарий лечащего врача",
              );
              const teaserSource = (g.gene_effect_description || "").trim() || (g.variant_description || "").trim();
              const teaser = oneLinePreview(teaserSource, 110);
              const commentHint = hasDoctorComment
                ? `<span class="badge rounded-pill text-bg-info bg-opacity-75 small fw-normal ms-1"><i class="bi bi-chat-text me-1" aria-hidden="true"></i>Есть комментарий врача</span>`
                : "";
              const detailsInner = [
                g.risk_type ? textBlockCompact("Уровень риска (вариант)", riskLabel(g.risk_type)) : "",
                textBlockCompact("Описание гена", g.gene_description),
                textBlockCompact("Эффект / значение гена", g.gene_effect_description),
                textBlockCompact("Описание варианта", g.variant_description),
                doctorBlocks,
              ]
                .filter(Boolean)
                .join("");
              const hasDetails = detailsInner.replace(/\s/g, "").length > 0;
              const emptyDetails = `<p class="text-muted small mb-0">Дополнительных текстовых полей нет.</p>`;
              return `
          <details class="card app-card shadow-sm mb-2 passport-gene-card" id="passport-genotype-${g.id}">
            <summary class="d-flex align-items-start justify-content-between gap-2 py-2 px-3 user-select-none">
              <div class="min-w-0 flex-grow-1">
                <div class="fw-semibold d-flex flex-wrap align-items-center gap-2">
                  <span class="text-body">${sym}</span>
                  <span class="badge text-bg-light border font-monospace">${variant}</span>
                  ${commentHint}
                </div>
                ${
                  fullName
                    ? `<div class="small text-muted mt-1 text-truncate" title="${titleTip}">${escapeHtml(fullName)}</div>`
                    : ""
                }
                ${
                  teaser
                    ? `<div class="mt-2 small">
                        <span class="text-uppercase fw-semibold text-muted me-1" style="font-size:0.68rem; letter-spacing:0.04em;">Эффект:</span>
                        <span class="text-body">${escapeHtml(teaser)}</span>
                      </div>`
                    : ""
                }
              </div>
              <div class="d-flex align-items-center gap-1 flex-shrink-0 text-primary small pt-1">
                <span class="d-none d-sm-inline">Подробнее</span>
                <i class="bi bi-chevron-down passport-gene-chev text-primary" aria-hidden="true"></i>
              </div>
            </summary>
            <div class="border-top px-3 py-2 bg-body-tertiary bg-opacity-50">
              ${hasDetails ? detailsInner : emptyDetails}
            </div>
          </details>`;
            })
            .join("");
      return { cards, pg };
    };

    const wellnessBanner = getWithoutGeneticTestFlag()
      ? `<div class="alert alert-info border-0 bg-info bg-opacity-10 small mb-3">Режим «без генетического теста»: паспорт доступен по прямой ссылке. Настройка — в <a href="#/profile">профиле</a>.</div>`
      : "";

    const initial = renderCards(list);
    pageEl.innerHTML = `
      <div class="app-page">
      ${wellnessBanner}
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h3 class="mb-0">Генетический паспорт</h3>
        <a class="btn btn-outline-secondary btn-sm" href="#/recommendations">Перейти к рекомендациям</a>
      </div>
      <p class="text-muted small mb-3">В списке представлены символы генов, их названия и ваши результаты. Нажмите "Подробнее", чтобы увидеть подробную интерпретацию, оценку рисков и персональные рекомендации врача.</p>
      <style>
        .passport-gene-card > summary { list-style: none; cursor: pointer; }
        .passport-gene-card > summary::-webkit-details-marker { display: none; }
        .passport-gene-card[open] > summary .passport-gene-chev { transform: rotate(180deg); }
        .passport-gene-chev { transition: transform 0.2s ease; display: inline-block; }
        .passport-gene-card summary:hover { background: rgba(0,0,0,0.02); }
      </style>
      <div id="passport-list">${initial.cards}</div>
      <div id="passport-pagination" class="d-flex align-items-center justify-content-between mt-3">
        <button class="btn btn-sm btn-outline-secondary" id="passport-prev" ${initial.pg.page <= 1 ? "disabled" : ""}>Назад</button>
        <span class="small text-muted">Страница ${initial.pg.page} из ${initial.pg.pages}</span>
        <button class="btn btn-sm btn-outline-secondary" id="passport-next" ${initial.pg.page >= initial.pg.pages ? "disabled" : ""}>Вперед</button>
      </div>
      </div>
    `;

    const repaint = () => {
      const r = renderCards(list);
      const listEl = pageEl.querySelector("#passport-list");
      const pagEl = pageEl.querySelector("#passport-pagination");
      if (listEl) listEl.innerHTML = r.cards;
      if (pagEl) {
        pagEl.innerHTML = `<button class="btn btn-sm btn-outline-secondary" id="passport-prev" ${r.pg.page <= 1 ? "disabled" : ""}>Назад</button>
          <span class="small text-muted">Страница ${r.pg.page} из ${r.pg.pages}</span>
          <button class="btn btn-sm btn-outline-secondary" id="passport-next" ${r.pg.page >= r.pg.pages ? "disabled" : ""}>Вперед</button>`;
        pagEl.querySelector("#passport-prev")?.addEventListener("click", () => {
          page = Math.max(1, page - 1);
          repaint();
        });
        pagEl.querySelector("#passport-next")?.addEventListener("click", () => {
          page = Math.min(r.pg.pages, page + 1);
          repaint();
        });
      }
    };
    repaint();

    const focusId = route?.focusGenotypeId;
    if (focusId != null) {
      requestAnimationFrame(() => {
        const det = document.getElementById(`passport-genotype-${focusId}`);
        if (det && det.tagName === "DETAILS") det.open = true;
        det?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
  }
}
