import { matchVitaminBySubstrings } from "../../data/symptomTestMap.js?v=2";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function row(it) {
  return `<tr>
    <td class="text-muted small text-nowrap">${escapeHtml(it.item_id || "")}</td>
    <td class="small">${escapeHtml((it.label || "").slice(0, 64))}…</td>
    <td class="text-nowrap small">${it.is_active ? "да" : "нет"}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-sm btn-outline-primary" data-e="1" data-ik="${escapeHtml(it.item_id || "")}">Правка</button>
      <button class="btn btn-sm btn-outline-danger" data-d="1" data-ik="${escapeHtml(it.item_id || "")}">Уд.</button>
    </td>
  </tr>`;
}

function geneOptions(genes, selectedSymbols) {
  const set = new Set((selectedSymbols || []).map((x) => String(x).trim()));
  return (genes || [])
    .slice()
    .sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || ""), "ru"))
    .map((g) => {
      const sym = String(g.symbol || "").trim();
      const lab = [sym, g.full_name ? ` — ${g.full_name}` : ""].join("");
      return `<option value="${escapeHtml(sym)}" ${set.has(sym) ? "selected" : ""}>${escapeHtml(lab)}</option>`;
    })
    .join("");
}

function vitaminOptions(vitamins, substrings) {
  const subs = substrings || [];
  return (vitamins || [])
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"))
    .map((v) => {
      const name = v.name || "";
      const id = v.id;
      const picked = name && matchVitaminBySubstrings(name, subs);
      return `<option value="${Number(id)}" ${picked ? "selected" : ""}>${escapeHtml(name)}</option>`;
    })
    .join("");
}

/**
 * @param {object|undefined} d
 * @param {object[]} genes
 * @param {object[]} vitamins
 */
function form(d, genes, vitamins) {
  const D = d || {};
  return `
  <form class="vstack gap-2" data-sf>
    <div>
      <label class="form-label small">ID пункта (slug, лат. буквы, цифры, _)</label>
      <input class="form-control" name="item_id" required
        value="${escapeHtml(D.item_id || "")}"
        ${D.item_id ? "readonly" : ""} pattern="[a-zA-Z0-9_\\-]+" />
    </div>
    <div>
      <label class="form-label small">Группа</label>
      <input class="form-control" name="group" value="${escapeHtml(D.group || "")}" required />
    </div>
    <div>
      <label class="form-label small">Текст симптома</label>
      <textarea class="form-control" name="label" rows="2" required>${escapeHtml(D.label || "")}</textarea>
    </div>
    <div>
      <label class="form-label small">Гены (каталог)</label>
      <p class="text-muted small mb-1">Список из справочника. Удерживайте <kbd>Ctrl</kbd> (<kbd>⌘</kbd> на Mac) для выбора нескольких.</p>
      <select class="form-select" name="gene_symbols" multiple size="10" style="min-height: 10rem">
        ${geneOptions(genes, D.gene_symbols || [])}
      </select>
    </div>
    <div>
      <label class="form-label small">Витамины (каталог)</label>
      <p class="text-muted small mb-1">По названию в справочнике; в расчёте теста используется сопоставление, как в блоке анализов. Удерживайте <kbd>Ctrl</kbd> для выбора нескольких.</p>
      <select class="form-select" name="vitamin_ids" multiple size="10" style="min-height: 10rem">
        ${vitaminOptions(vitamins, D.vitamin_substrings || [])}
      </select>
    </div>
    <div class="row g-2">
      <div class="col-4">
        <label class="form-label small">Порядок</label>
        <input class="form-control" type="number" name="sort_order" value="${Number(D.sort_order) || 0}" min="0" />
      </div>
      <div class="col-4 d-flex align-items-end">
        <label class="form-check small">
          <input class="form-check-input" name="is_active" type="checkbox" ${D.is_active !== false ? "checked" : ""} />
          Активен
        </label>
      </div>
    </div>
  </form>
  `;
}

/**
 * @param {HTMLFormElement} f
 * @param {object[]} vitamins
 */
function readForm(f, vitamins) {
  const byId = new Map((vitamins || []).map((v) => [Number(v.id), v]));
  const gSel = f.querySelector('select[name="gene_symbols"]');
  const vSel = f.querySelector('select[name="vitamin_ids"]');
  const geneSymbols = gSel
    ? Array.from(gSel.selectedOptions)
        .map((o) => o.value)
        .filter(Boolean)
    : [];
  const vitSubs = vSel
    ? Array.from(vSel.selectedOptions)
        .map((o) => {
          const id = Number(o.value);
          const v = byId.get(id);
          return v && v.name ? String(v.name).trim() : "";
        })
        .filter(Boolean)
    : [];
  const fd = new FormData(f);
  return {
    item_id: (fd.get("item_id") || "").toString().trim(),
    group: (fd.get("group") || "").toString().trim(),
    label: (fd.get("label") || "").toString(),
    gene_symbols: geneSymbols,
    vitamin_substrings: vitSubs,
    sort_order: Number(fd.get("sort_order")) || 0,
    is_active: f.querySelector('input[name="is_active"]')?.checked === true,
  };
}

export async function render(pageEl, { api, showAlert }) {
  let list = [];
  let genes = [];
  let vitamins = [];
  try {
    [list, genes, vitamins] = await Promise.all([
      api.admin.listSymptomTestItems().then((x) => x || []),
      api.patient.listGeneCatalog().then((x) => x || []),
      api.patient.listVitaminCatalog().then((x) => x || []),
    ]);
  } catch (e) {
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e?.message || "Ошибка")}</div>`;
    return;
  }
  if (!Array.isArray(list)) list = [];
  if (!Array.isArray(genes)) genes = [];
  if (!Array.isArray(vitamins)) vitamins = [];

  pageEl.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
      <h1 class="h3 mb-0">Тест по симптомам (пункты)</h1>
    </div>
    <p class="text-secondary small">Гены и витамины выбираются из справочников, как в блоке теста у пациента. При сохранении витамины записываются по названиям (для совпадения с каталогом на странице теста).</p>
    <div class="card shadow-sm mb-3">
      <div class="card-header bg-white">Новый пункт</div>
      <div class="card-body" id="s-new-wrap">${form(undefined, genes, vitamins)}</div>
      <div class="card-body pt-0"><button class="btn btn-primary" type="button" id="s-add">Создать</button></div>
    </div>
    <div class="card shadow-sm">
      <div class="card-header bg-white">Список (${list.length})</div>
      <div class="table-responsive p-0">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light"><tr><th>ID</th><th>Текст</th><th>Акт.</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(row).join("") : "<tr><td colspan=4 class='text-center text-muted py-3'>Пусто</td></tr>"}</tbody>
        </table>
      </div>
    </div>
    <div class="modal fade" id="sm" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title" id="smt">Правка</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body" id="smb"></div>
        <div class="modal-footer"><button class="btn btn-primary" type="button" id="sms">Сохранить</button></div>
      </div></div>
    </div>
  `;

  const vMap = vitamins;

  pageEl.querySelector("#s-add")?.addEventListener("click", async () => {
    const f = pageEl.querySelector("#s-new-wrap form");
    try {
      if (!f) return;
      const p = readForm(f, vMap);
      await api.admin.createSymptomTestItem(p);
      showAlert("success", "Создано");
      await render(pageEl, { api, showAlert });
    } catch (e) {
      showAlert("danger", e?.message || "Ошибка");
    }
  });

  const modal = new bootstrap.Modal(pageEl.querySelector("#sm"));
  let eik = null;
  pageEl.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.dataset.d && t.dataset.ik) {
      if (!window.confirm("Удалить пункт?")) return;
      try {
        await api.admin.deleteSymptomTestItem(t.dataset.ik);
        showAlert("success", "Удалено");
        await render(pageEl, { api, showAlert });
      } catch (e2) {
        showAlert("danger", e2?.message);
      }
    }
    if (t.dataset.e && t.dataset.ik) {
      eik = t.dataset.ik;
      const o = list.find((x) => (x.item_id || "") === eik);
      if (!o) return;
      pageEl.querySelector("#smb").innerHTML = form(o, genes, vitamins);
      pageEl.querySelector("#smt").textContent = eik;
      modal.show();
    }
  });
  pageEl.querySelector("#sms")?.addEventListener("click", async () => {
    const f = pageEl.querySelector("#smb form");
    if (!f || !eik) return;
    try {
      const p = readForm(f, vMap);
      if (p.item_id !== eik) {
        f.querySelector('input[name="item_id"]').value = eik;
        p.item_id = eik;
      }
      await api.admin.updateSymptomTestItem(eik, p);
      modal.hide();
      showAlert("success", "OK");
      await render(pageEl, { api, showAlert });
    } catch (e) {
      showAlert("danger", e?.message);
    }
  });
}
