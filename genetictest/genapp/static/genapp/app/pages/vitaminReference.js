import { api } from "../services/api.js?v=19";
import { showAlert } from "../components/alerts.js?v=3";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function typeBadgeHtml(v) {
  const key = (v.category || "").trim();
  const label = (v.category_label || "").trim();
  if (!key && !label) {
    return '<span class="badge rounded-pill text-bg-light border text-secondary">Тип не указан</span>';
  }
  const isFat = key === "fat-soluble";
  const cls = isFat ? "text-bg-warning" : "text-bg-info";
  return `<span class="badge rounded-pill ${cls}">${escapeHtml(label || key)}</span>`;
}

function filterList(all, q, categoryKey) {
  const needle = (q || "").trim().toLowerCase();
  return (all || []).filter((v) => {
    if (categoryKey === "__any__" || !categoryKey) {
      /* all */
    } else if (categoryKey === "__none__") {
      if ((v.category || "").trim()) return false;
    } else if ((v.category || "").trim() !== categoryKey) {
      return false;
    }
    if (!needle) return true;
    const name = String(v.name || "").toLowerCase();
    const desc = String(v.description || "").toLowerCase();
    return name.includes(needle) || desc.includes(needle);
  });
}

function paginate(items, page, pageSize) {
  const total = Array.isArray(items) ? items.length : 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pages,
    total,
  };
}

function mountList(mount, items, totalCount, page, pages) {
  const shown = items.length;
  mount.innerHTML = `
    <p class="small text-muted mb-3">Показано: <strong>${shown}</strong> из <strong>${totalCount}</strong></p>
    ${
      shown === 0
        ? `<div class="alert alert-light border text-secondary mb-0">Ничего не найдено — измените поиск или фильтр.</div>`
        : `<div class="d-flex flex-column gap-1">
      ${items
        .map(
          (v) => `
        <div class="list-group-item rounded-3 border shadow-sm px-3 py-2">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
            <div class="fw-semibold text-dark small">${escapeHtml(v.name || "—")}</div>
            ${typeBadgeHtml(v)}
          </div>
          <div class="small text-dark" style="white-space:pre-wrap;line-height:1.35">
            ${
              (v.description || "").trim()
                ? escapeHtml(v.description)
                : '<span class="fst-italic text-muted">Описание в справочнике пока не заполнено.</span>'
            }
          </div>
        </div>`,
        )
        .join("")}
    </div>
    ${
      pages > 1
        ? `<div class="d-flex align-items-center justify-content-between gap-2 mt-3">
      <button type="button" class="btn btn-sm btn-outline-secondary" id="vit-ref-prev" ${page <= 1 ? "disabled" : ""}>Назад</button>
      <span class="small text-muted">Страница ${page} из ${pages}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="vit-ref-next" ${page >= pages ? "disabled" : ""}>Вперед</button>
    </div>`
        : ""
    }`
    }`;
}

export async function render(pageEl) {
  try {
    const raw = await api.patient.listVitaminCatalog();
    const all = Array.isArray(raw) ? [...raw].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru")) : [];

    pageEl.innerHTML = `
      <div class="vitamin-reference-root">
        <p class="text-secondary small mb-3">
          Справочная информация по витаминам и минералам.
        </p>
        <div class="row g-2 align-items-end mb-3">
          <div class="col-12 col-md-6">
            <label for="vit-ref-search" class="form-label small mb-1">Поиск</label>
            <input type="search" id="vit-ref-search" class="form-control" placeholder="Название или текст описания…" autocomplete="off" />
          </div>
          <div class="col-12 col-md-4">
            <label for="vit-ref-filter" class="form-label small mb-1">Тип</label>
            <select id="vit-ref-filter" class="form-select">
              <option value="__any__">Все типы</option>
              <option value="fat-soluble">Жирорастворимые</option>
              <option value="water-soluble">Водорастворимые</option>
              <option value="__none__">Без типа</option>
            </select>
          </div>
        </div>
        <div id="vit-ref-mount"></div>
      </div>`;

    const searchEl = pageEl.querySelector("#vit-ref-search");
    const filterEl = pageEl.querySelector("#vit-ref-filter");
    const mount = pageEl.querySelector("#vit-ref-mount");

    let currentPage = 1;
    const pageSize = 8;

    const paint = () => {
      const q = searchEl?.value || "";
      const cat = filterEl?.value || "__any__";
      const filtered = filterList(all, q, cat);
      const pg = paginate(filtered, currentPage, pageSize);
      currentPage = pg.page;
      mountList(mount, pg.items, filtered.length, pg.page, pg.pages);
      mount.querySelector("#vit-ref-prev")?.addEventListener("click", () => {
        currentPage = Math.max(1, currentPage - 1);
        paint();
      });
      mount.querySelector("#vit-ref-next")?.addEventListener("click", () => {
        currentPage = Math.min(pg.pages, currentPage + 1);
        paint();
      });
    };

    paint();
    let t;
    searchEl?.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        currentPage = 1;
        paint();
      }, 180);
    });
    filterEl?.addEventListener("change", () => {
      currentPage = 1;
      paint();
    });
  } catch (err) {
    showAlert("danger", err.message || "Не удалось загрузить справочник.");
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || "Ошибка")}</div>`;
  }
}
