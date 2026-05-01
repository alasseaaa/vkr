function statusBadge(status) {
  if (status === "Дефицит") return `<span class="badge bg-danger badge-status">${status}</span>`;
  if (status === "Норма") return `<span class="badge bg-success badge-status">${status}</span>`;
  if (status === "Профицит") return `<span class="badge bg-warning text-dark badge-status">${status}</span>`;
  return `<span class="badge bg-secondary badge-status">${status || "—"}</span>`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

import { doctorCommentsForMarkerHtml } from "../components/doctorComment.js";

function vitaminOptionsHtml(vitamins) {
  if (!vitamins?.length) {
    return '<option value="">Нет витаминов в справочнике</option>';
  }
  return (
    '<option value="">Выберите витамин…</option>' +
    vitamins
      .map((v) => {
        const extra = v.unit_test ? ` (${v.unit_test})` : "";
        return `<option value="${v.id}">${escapeHtml(v.name || "")}${escapeHtml(extra)}</option>`;
      })
      .join("")
  );
}

/** Карточка подсказок: симптомы + генетика. */
function buildSuggestionsCard(suggestedPayload, escapeHtmlFn) {
  const data = suggestedPayload && typeof suggestedPayload === "object" ? suggestedPayload : {};
  const sugList = Array.isArray(data.suggestions) ? data.suggestions : [];
  if (!sugList.length) {
    return `<div class="card app-card shadow-sm mb-3 border-0" style="border-left:4px solid #0d6efd!important;background:linear-gradient(180deg,#f0f7ff 0%,#fff 100%)">
      <div class="card-body py-3">
        <div class="d-flex align-items-start gap-2 mb-2">
          <i class="bi bi-clipboard-pulse text-primary fs-4 flex-shrink-0" aria-hidden="true"></i>
          <div>
            <div class="fw-bold text-dark mb-1">Что сдать в лаборатории</div>
            <p class="small text-secondary mb-0">Подсказки появятся после <a href="#/symptom-test" class="fw-semibold">теста симптомов</a> или генотипов с рекомендациями по витаминам.</p>
          </div>
        </div>
      </div>
    </div>`;
  }
  const rows = sugList
    .map((s) => {
      const v = s.vitamin || {};
      const vid = v.id;
      const srcOrder = { symptoms: 0, genetics: 1 };
      const srcLabels = (s.sources || [])
        .slice()
        .sort((a, b) => (srcOrder[a] ?? 9) - (srcOrder[b] ?? 9))
        .map((x) => (x === "symptoms" ? "симптомы" : x === "genetics" ? "генетика" : ""))
        .filter(Boolean);
      const sourceInline =
        srcLabels.length > 0
          ? `<span class="text-secondary small fw-normal" style="opacity:0.72">· ${srcLabels.join(", ")}</span>`
          : "";
      const hasTest = Boolean(s.has_test);
      const actionBtn = hasTest
        ? `<button type="button" class="btn btn-sm btn-primary flex-shrink-0" data-action="prefill-vitamin" data-vitamin-id="${vid}">Внести повторно</button>`
        : `<button type="button" class="btn btn-sm btn-primary flex-shrink-0" data-action="prefill-vitamin" data-vitamin-id="${vid}">Внести анализ</button>`;
      return `<div class="d-flex flex-wrap align-items-start justify-content-between gap-2 py-2 border-bottom border-light">
      <div class="min-w-0 flex-grow-1">
        <div class="d-flex flex-wrap align-items-baseline column-gap-1 row-gap-0">
        <span class="fw-semibold">${escapeHtmlFn(v.name || "")}</span>
        <span class="text-muted small">${escapeHtmlFn(v.unit_test ? ` (${v.unit_test})` : "")}</span>${sourceInline}
        </div>
      </div>
      <div class="flex-shrink-0 align-self-center">${actionBtn}</div>
    </div>`;
    })
    .join("");
  return `<div class="card app-card shadow-sm mb-3" style="border-left:4px solid #0d6efd!important">
    <div class="card-header border-bottom py-3" style="background:linear-gradient(180deg,#e8f2ff 0%,#fff 100%)">
      <div class="d-flex align-items-start gap-2">
        <i class="bi bi-clipboard-pulse text-primary fs-3 flex-shrink-0" aria-hidden="true"></i>
        <div>
          <div class="fw-bold text-dark mb-1">Рекомендуемые анализы</div>
          <p class="small mb-0 text-body-secondary">На основе вашего генетического паспорта и отмеченных симптомов выделены показатели, которые находятся в зоне риска. Лабораторный тест поможет подтвердить или опровергнуть текущий дефицит.</p>
        </div>
      </div>
    </div>
    <div class="card-body py-0">${rows}</div>
  </div>`;
}

export async function render(pageEl, { api, showAlert, route } = {}) {
  if (pageEl._vitaminClickHandler) {
    pageEl.removeEventListener("click", pageEl._vitaminClickHandler);
    pageEl._vitaminClickHandler = null;
  }

  pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка…</div></div>`;

  let vitamins = [];
  let suggestedPayload;
  try {
    vitamins = await api.patient.listVitaminCatalog();
    if (!Array.isArray(vitamins)) vitamins = [];
  } catch (e) {
    showAlert("danger", e.message);
  }

  const vOpts = vitaminOptionsHtml(vitamins);

  const load = async () => {
    const data = await api.patient.listVitaminTests();
    return Array.isArray(data) ? data : [];
  };

  let tests;
  let allComments = [];
  try {
    const [tdata, cdata, sdata] = await Promise.all([
      load(),
      api.comments.list({}).catch(() => []),
      api.patient.listSuggestedVitamins().catch(() => null),
    ]);
    tests = tdata;
    allComments = Array.isArray(cdata) ? cdata : [];
    suggestedPayload =
      sdata && typeof sdata === "object"
        ? sdata
        : { suggestions: [], symptom_test_updated_at: null };
  } catch {
    tests = await load();
    allComments = [];
    suggestedPayload = { suggestions: [], symptom_test_updated_at: null };
  }
  if (!suggestedPayload || typeof suggestedPayload !== "object") {
    suggestedPayload = { suggestions: [], symptom_test_updated_at: null };
  }
  const suggestionsCardHtml = buildSuggestionsCard(suggestedPayload, escapeHtml);

  const byTest = new Map();
  for (const c of allComments) {
    const tid = c.vitamin_reading_id;
    if (tid == null) continue;
    const k = Number(tid);
    if (!byTest.has(k)) byTest.set(k, []);
    byTest.get(k).push(c);
  }

  const refresh = async () => {
    tests = await load();
    await render(pageEl, { api, showAlert, route });
  };

  pageEl.innerHTML = `
    <div class="app-page">
    <div class="app-page-header d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h1 class="app-page-title h3 mb-0">Анализы витаминов</h1>
      <a class="btn btn-outline-secondary btn-sm" href="#/recommendations">К рекомендациям</a>
    </div>

    ${suggestionsCardHtml}

    <div class="card app-card shadow-sm mb-3">
      <div class="card-header bg-white">
        <div class="fw-semibold">Добавить анализ</div>
        <div class="text-muted small">Выберите витамин из справочника.</div>
      </div>
      <div class="card-body">
        <form id="create-form" class="row g-2 align-items-end">
          <div class="col-md-4">
            <label class="form-label small">Витамин</label>
            <select name="vitamin" class="form-select" required>${vOpts}</select>
          </div>
          <div class="col-md-3">
            <label class="form-label small">Значение</label>
            <input name="test_value" type="number" step="0.01" class="form-control" required />
          </div>
          <div class="col-md-3">
            <label class="form-label small">Дата анализа</label>
            <input name="test_date" type="date" class="form-control" required />
          </div>
          <div class="col-md-2">
            <button class="btn btn-primary w-100" type="submit" ${vitamins.length ? "" : "disabled"}>
              <i class="bi bi-plus-circle me-1"></i>Добавить
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="card app-card shadow-sm">
      <div class="card-header bg-white">
        <div class="fw-semibold">Список анализов</div>
      </div>
      <div class="card-body p-0">
        <table class="table table-hover mb-0 align-middle">
          <thead class="table-light">
            <tr>
              <th>Витамин</th>
              <th>Значение</th>
              <th>Статус</th>
              <th>Дата</th>
              <th class="text-end">Действия</th>
            </tr>
          </thead>
          <tbody>
            ${
              tests.length
                ? tests
                    .map((t) => {
                      const markerComments = byTest.get(Number(t.id)) || [];
                      const docHtml = doctorCommentsForMarkerHtml(
                        markerComments,
                        "Комментарий врача к анализу",
                      );
                      return `
                <tr id="vitamin-test-${t.id}">
                  <td>
                    <div class="fw-semibold">${t.vitamin_name || ""}</div>
                    <div class="text-muted small">${t.vitamin_unit_test || ""}</div>
                  </td>
                  <td>${t.test_value}</td>
                  <td>${statusBadge(t.status)}</td>
                  <td>${t.test_date}</td>
                  <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-id="${t.id}">
                      Изменить
                    </button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${t.id}">
                      Удалить
                    </button>
                  </td>
                </tr>
                ${
                  docHtml
                    ? `<tr class="border-0"><td colspan="5" class="bg-transparent pt-0 pb-3 border-0">${docHtml}</td></tr>`
                    : ""
                }
              `;
                    })
                    .join("")
                : `<tr><td colspan="5" class="text-center text-muted py-4">Пока нет анализов</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div id="edit-modal" class="modal" tabindex="-1" style="display:none">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Редактирование анализа</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body">
            <form id="edit-form">
              <input type="hidden" name="id" />
              <div class="row g-2">
                <div class="col-md-6">
                  <label class="form-label small">Витамин</label>
                  <select name="vitamin" class="form-select" required>${vOpts}</select>
                </div>
                <div class="col-md-6">
                  <label class="form-label small">Значение</label>
                  <input name="test_value" type="number" step="0.01" class="form-control" required />
                </div>
                <div class="col-12">
                  <label class="form-label small">Дата</label>
                  <input name="test_date" type="date" class="form-control" required />
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" form="edit-form" type="submit" ${vitamins.length ? "" : "disabled"}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  const createForm = pageEl.querySelector("#create-form");
  const dateInput = createForm.querySelector('input[name="test_date"]');
  if (dateInput && !dateInput.value) {
    const d = new Date();
    dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(createForm).entries());
      const vid = Number(data.vitamin);
      if (!vid) return;
      await api.patient.createVitaminTest({
        vitamin: vid,
        test_value: Number(data.test_value),
        test_date: data.test_date,
      });
      showAlert("success", "Анализ добавлен");
      await refresh();
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  const modalEl = pageEl.querySelector("#edit-modal");
  const editModal = new bootstrap.Modal(modalEl, {});

  const onPageClick = async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === "delete") {
      if (!confirm("Удалить анализ?")) return;
      try {
        await api.patient.deleteVitaminTest(id);
        showAlert("success", "Удалено");
        await refresh();
      } catch (err) {
        showAlert("danger", err.message);
      }
      return;
    }

    if (action === "prefill-vitamin") {
      const vid = Number(btn.dataset.vitaminId);
      if (!vid) return;
      const sel = createForm?.querySelector('select[name="vitamin"]');
      if (sel) {
        sel.value = String(vid);
        createForm.scrollIntoView({ behavior: "smooth", block: "start" });
        sel.focus();
      }
      return;
    }

    if (action === "edit") {
      const editTarget = tests.find((t) => Number(t.id) === id) || null;
      const form = modalEl.querySelector("#edit-form");
      form.querySelector('input[name="id"]').value = String(id);
      form.querySelector('select[name="vitamin"]').value = String(editTarget?.vitamin ?? "");
      form.querySelector('input[name="test_value"]').value = String(editTarget?.test_value ?? "");
      form.querySelector('input[name="test_date"]').value = String(editTarget?.test_date ?? "");
      editModal.show();
    }
  };
  pageEl._vitaminClickHandler = onPageClick;
  pageEl.addEventListener("click", onPageClick);

  const editForm = pageEl.querySelector("#edit-form");
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const formData = Object.fromEntries(new FormData(editForm).entries());
      const id = Number(formData.id);
      const vid = Number(formData.vitamin);
      if (!vid) return;
      await api.patient.updateVitaminTest(id, {
        vitamin: vid,
        test_value: Number(formData.test_value),
        test_date: formData.test_date,
      });
      editModal.hide();
      showAlert("success", "Сохранено");
      await refresh();
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  const fid = route?.focusTestId;
  if (fid != null) {
    requestAnimationFrame(() => {
      document.getElementById(`vitamin-test-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
