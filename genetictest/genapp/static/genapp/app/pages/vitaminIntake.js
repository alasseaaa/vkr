import { destroyVitaminTrendChart, mountVitaminTrendChart } from "../utils/vitaminTrendChart.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateRu(iso) {
  if (iso == null || iso === "") return "—";
  const s = String(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return s;
}

function testDateSortKey(testDateStr) {
  if (!testDateStr) return 0;
  const t = new Date(testDateStr).getTime();
  return Number.isFinite(t) ? t : 0;
}

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

function sourcesToSuggestedFrom(sources) {
  if (!Array.isArray(sources)) return "";
  const u = new Set(sources);
  if (u.has("symptoms") && u.has("genetics")) return "both";
  if (u.has("symptoms")) return "symptoms";
  if (u.has("genetics")) return "genetics";
  return "";
}

function suggestedFromRu(code) {
  const m = {
    manual: "вручную",
    symptoms: "подсказка: симптомы",
    genetics: "подсказка: генетика",
    both: "подсказка: симптомы и генетика",
  };
  return m[code] || "";
}

function buildIntakeSuggestionsCard(suggestedPayload, activeVitaminIds, escapeHtmlFn) {
  const data = suggestedPayload && typeof suggestedPayload === "object" ? suggestedPayload : {};
  const sugList = Array.isArray(data.suggestions) ? data.suggestions : [];
  if (!sugList.length) {
    return `<div class="card app-card shadow-sm mb-3 border-0" style="border-left:4px solid #198754!important;background:linear-gradient(180deg,#f4fbf6 0%,#fff 100%)">
      <div class="card-body py-3">
        <div class="d-flex align-items-start gap-2 mb-2">
          <i class="bi bi-capsule text-success fs-4 flex-shrink-0" aria-hidden="true"></i>
          <div>
            <div class="fw-bold text-dark mb-1">Возможно принимаете</div>
            <p class="small text-secondary mb-0">Подсказки появятся после <a href="#/symptom-test" class="fw-semibold">теста симптомов</a> или данных генетики по витаминам. Заведите курс с датой начала; окончание отметите позже.</p>
          </div>
        </div>
      </div>
    </div>`;
  }
  const rows = sugList
    .map((s) => {
      const v = s.vitamin || {};
      const vid = v.id;
      const active = vid != null && activeVitaminIds.has(Number(vid));
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
      const badge = active
        ? `<span class="badge bg-secondary ms-1">есть активный курс</span>`
        : "";
      return `<div class="d-flex flex-wrap align-items-start justify-content-between gap-2 py-2 border-bottom border-light">
      <div class="min-w-0 flex-grow-1">
        <div class="d-flex flex-wrap align-items-baseline column-gap-1 row-gap-0">
        <span class="fw-semibold">${escapeHtmlFn(v.name || "")}</span>
        <span class="text-muted small">${escapeHtmlFn(v.unit_test ? ` (${v.unit_test})` : "")}</span>${sourceInline}${badge}
        </div>
      </div>
      <div class="flex-shrink-0 align-self-center">
        <button type="button" class="btn btn-sm btn-outline-success" data-action="prefill-intake" data-vitamin-id="${vid}" data-suggested-from="${escapeHtmlFn(
        sourcesToSuggestedFrom(s.sources || []),
      )}" ${active ? "disabled" : ""}>Добавить курс</button>
      </div>
    </div>`;
    })
    .join("");
  return `<div class="card app-card shadow-sm mb-3" style="border-left:4px solid #198754!important">
    <div class="card-header border-bottom py-3" style="background:linear-gradient(180deg,#e8f8ed 0%,#fff 100%)">
      <div class="d-flex align-items-start gap-2">
        <i class="bi bi-capsule text-success fs-3 flex-shrink-0" aria-hidden="true"></i>
        <div>
          <div class="fw-bold text-dark mb-1">Возможно принимаете</div>
          <p class="small mb-0 text-body-secondary">По симптомам и генетике отмечены витамины в зоне внимания. Укажите дату начала курса; дату окончания можно будет отметить позже, когда приём завершите.</p>
        </div>
      </div>
    </div>
    <div class="card-body py-0">${rows}</div>
  </div>`;
}

function testsInCourseWindow(intake, testsByVitamin) {
  const vid = Number(intake.vitamin);
  const list = testsByVitamin.get(vid) || [];
  const start = intake.started_on ? new Date(intake.started_on).getTime() : 0;
  const end = intake.ended_on ? new Date(intake.ended_on).getTime() : null;
  return list.filter((t) => {
    const td = testDateSortKey(t.test_date);
    if (!td) return false;
    if (td < start) return false;
    if (end != null && Number.isFinite(end) && td > end) return false;
    return true;
  });
}

export async function render(pageEl, { api, showAlert } = {}) {
  if (pageEl._intakeHandler) {
    pageEl.removeEventListener("click", pageEl._intakeHandler);
    pageEl._intakeHandler = null;
  }
  destroyVitaminTrendChart(pageEl);

  pageEl.innerHTML = `<div class="text-muted small py-2">Загрузка…</div>`;

  let vitamins = [];
  try {
    vitamins = await api.patient.listVitaminCatalog();
    if (!Array.isArray(vitamins)) vitamins = [];
  } catch (e) {
    showAlert("danger", e.message);
  }

  const vOpts = vitaminOptionsHtml(vitamins);

  let intakes = [];
  let suggestedPayload = { suggestions: [], symptom_test_updated_at: null };
  let tests = [];
  try {
    const [idata, sdata, tdata] = await Promise.all([
      api.patient.listVitaminIntakes().catch(() => []),
      api.patient.listSuggestedVitamins().catch(() => null),
      api.patient.listVitaminTests().catch(() => []),
    ]);
    intakes = Array.isArray(idata) ? idata : [];
    suggestedPayload =
      sdata && typeof sdata === "object" ? sdata : { suggestions: [], symptom_test_updated_at: null };
    tests = Array.isArray(tdata) ? tdata : [];
  } catch {
    intakes = [];
    tests = [];
  }

  const testsByVitamin = new Map();
  for (const t of tests) {
    const vid = Number(t.vitamin);
    if (!Number.isFinite(vid)) continue;
    if (!testsByVitamin.has(vid)) testsByVitamin.set(vid, []);
    testsByVitamin.get(vid).push(t);
  }
  for (const [, arr] of testsByVitamin) {
    arr.sort((a, b) => testDateSortKey(b.test_date) - testDateSortKey(a.test_date));
  }

  const activeVitaminIds = new Set();
  for (const row of intakes) {
    if (row.is_active_course && row.vitamin != null) {
      activeVitaminIds.add(Number(row.vitamin));
    }
  }

  const sugCard = buildIntakeSuggestionsCard(suggestedPayload, activeVitaminIds, escapeHtml);

  const refresh = async () => {
    await render(pageEl, { api, showAlert });
  };

  pageEl.innerHTML = `
    <div class="app-page">
      <div class="app-page-header d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h2 class="h5 mb-0">Приём добавок</h2>
        <a class="btn btn-outline-secondary btn-sm" href="#/recommendations">К рекомендациям</a>
      </div>

      ${sugCard}

      <div class="card app-card shadow-sm mb-3">
        <div class="card-header bg-white">
          <div class="fw-semibold">Динамика анализов</div>
        </div>
        <div class="card-body">
          <div id="vitamin-trend-hint" class="small text-muted mb-2"></div>
          <div class="position-relative" style="min-height:220px;max-height:300px">
            <canvas id="vitamin-tests-trend-chart" class="w-100" style="max-height:280px" aria-label="График динамики витаминов"></canvas>
          </div>
          <p class="small text-muted mt-2 mb-0">Внести или изменить значения можно на вкладке «Анализы».</p>
        </div>
      </div>

      <div class="card app-card shadow-sm mb-3">
        <div class="card-header bg-white">
          <div class="fw-semibold">Новый курс</div>
          <div class="text-muted small">Дата начала и по желанию фото упаковки (до 5 МБ, JPEG/PNG/WebP/GIF). Окончание курса отмечается позже в «Изменить» или кнопкой «Завершить» в таблице.</div>
        </div>
        <div class="card-body">
          <form id="intake-create-form" class="row g-2">
            <input type="hidden" name="suggested_from" value="" />
            <div class="col-md-5">
              <label class="form-label small">Витамин</label>
              <select name="vitamin" class="form-select" required>${vOpts}</select>
            </div>
            <div class="col-md-3">
              <label class="form-label small">Начало приёма</label>
              <input name="started_on" type="date" class="form-control" required />
            </div>
            <div class="col-md-4">
              <label class="form-label small">Дозировка / форма</label>
              <input name="dose_note" type="text" class="form-control" maxlength="255" placeholder="Напр. 400 МЕ" />
            </div>
            <div class="col-md-8">
              <label class="form-label small">Заметки</label>
              <input name="notes" type="text" class="form-control" placeholder="По желанию" />
            </div>
            <div class="col-md-6">
              <label class="form-label small">Фото банки</label>
              <input name="photo" type="file" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif" />
            </div>
            <div class="col-12">
              <button class="btn btn-primary" type="submit" ${vitamins.length ? "" : "disabled"}>
                <i class="bi bi-plus-circle me-1"></i>Сохранить курс
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="card app-card shadow-sm">
        <div class="card-header bg-white">
          <div class="fw-semibold">Мои курсы</div>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead class="table-light">
                <tr>
                  <th>Витамин</th>
                  <th>Период</th>
                  <th>Дозировка</th>
                  <th>Статус</th>
                  <th>Анализы в периоде</th>
                  <th class="text-end">Действия</th>
                </tr>
              </thead>
              <tbody>
                ${
                  intakes.length
                    ? intakes
                        .map((row) => {
                          const period = `${formatDateRu(row.started_on)} — ${
                            row.ended_on ? formatDateRu(row.ended_on) : "…"
                          }`;
                          const st = row.is_active_course
                            ? '<span class="badge bg-success">активен</span>'
                            : '<span class="badge bg-secondary">завершён</span>';
                          const sf = row.suggested_from
                            ? `<div class="small text-muted">${escapeHtml(suggestedFromRu(row.suggested_from))}</div>`
                            : "";
                          const nearby = testsInCourseWindow(row, testsByVitamin);
                          const nearbyHtml = nearby.length
                            ? nearby
                                .slice(0, 3)
                                .map(
                                  (t) =>
                                    `<div class="small">${escapeHtml(formatDateRu(t.test_date))}: ${escapeHtml(
                                      String(t.test_value),
                                    )} ${escapeHtml(t.vitamin_unit_test || "")}</div>`,
                                )
                                .join("")
                            : `<span class="text-muted small">—</span>`;
                          const photoBtn = row.photo_url
                            ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-action="photo" data-id="${row.id}">Фото</button>`
                            : `<span class="text-muted small">—</span>`;
                          return `
                    <tr>
                      <td>
                        <div class="fw-semibold">${escapeHtml(row.vitamin_name || "")}</div>
                        <div class="text-muted small">${escapeHtml(row.vitamin_unit_test || "")}</div>
                        ${sf}
                      </td>
                      <td>${escapeHtml(period)}</td>
                      <td>${escapeHtml(row.dose_note || "—")}</td>
                      <td>${st}</td>
                      <td>
                        ${nearbyHtml}
                        ${nearby.length > 3 ? `<div class="small text-muted">+ ещё ${nearby.length - 3}</div>` : ""}
                        <div class="mt-1">${photoBtn}</div>
                      </td>
                      <td class="text-end text-nowrap">
                        ${
                          row.is_active_course
                            ? `<button type="button" class="btn btn-sm btn-outline-success me-1" data-action="finish-intake" data-id="${row.id}" title="Отметить окончание приёма">Завершить</button>`
                            : ""
                        }
                        <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${row.id}">Изменить</button>
                        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${row.id}">Удалить</button>
                      </td>
                    </tr>`;
                        })
                        .join("")
                    : `<tr><td colspan="6" class="text-center text-muted py-4">Пока нет курсов</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div id="intake-edit-modal" class="modal" tabindex="-1" style="display:none">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Редактирование курса</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body">
            <p class="small text-muted">Дату окончания укажите, когда приём завершён; для текущего курса поле можно оставить пустым.</p>
            <form id="intake-edit-form">
              <input type="hidden" name="id" />
              <div class="row g-2">
                <div class="col-md-6">
                  <label class="form-label small">Витамин</label>
                  <select name="vitamin" class="form-select" required>${vOpts}</select>
                </div>
                <div class="col-md-3">
                  <label class="form-label small">Начало приёма</label>
                  <input name="started_on" type="date" class="form-control" required />
                </div>
                <div class="col-md-3">
                  <label class="form-label small">Окончание приёма</label>
                  <input name="ended_on" type="date" class="form-control" />
                  <div class="form-text">Пусто — курс ещё идёт</div>
                </div>
                <div class="col-md-6">
                  <label class="form-label small">Дозировка</label>
                  <input name="dose_note" type="text" class="form-control" maxlength="255" />
                </div>
                <div class="col-md-6">
                  <label class="form-label small">Заметки</label>
                  <input name="notes" type="text" class="form-control" />
                </div>
                <div class="col-12">
                  <label class="form-label small">Новое фото (необязательно)</label>
                  <input name="photo" type="file" class="form-control" accept="image/jpeg,image/png,image/webp,image/gif" />
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" form="intake-edit-form" type="submit" ${vitamins.length ? "" : "disabled"}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const createForm = pageEl.querySelector("#intake-create-form");
  const sOn = createForm.querySelector('input[name="started_on"]');
  if (sOn && !sOn.value) {
    const d = new Date();
    sOn.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(createForm);
      const photo = fd.get("photo");
      const vid = Number(fd.get("vitamin"));
      if (!vid) return;
      const payload = {
        vitamin: vid,
        started_on: fd.get("started_on"),
        ended_on: null,
        dose_note: fd.get("dose_note") || "",
        notes: fd.get("notes") || "",
        suggested_from: fd.get("suggested_from") || "",
      };
      if (photo && photo.size) {
        const send = new FormData();
        send.append("vitamin", String(payload.vitamin));
        send.append("started_on", payload.started_on);
        send.append("dose_note", payload.dose_note);
        send.append("notes", payload.notes);
        if (payload.suggested_from) send.append("suggested_from", payload.suggested_from);
        send.append("photo", photo);
        await api.patient.createVitaminIntakeMultipart(send);
      } else {
        await api.patient.createVitaminIntake(payload);
      }
      showAlert("success", "Курс сохранён");
      await refresh();
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  const modalEl = pageEl.querySelector("#intake-edit-modal");
  const editModal = new bootstrap.Modal(modalEl, {});

  const onClick = async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = Number(btn.dataset.id);

    if (action === "prefill-intake") {
      const vid = Number(btn.dataset.vitaminId);
      const sf = btn.dataset.suggestedFrom || "";
      if (!vid) return;
      const sel = createForm.querySelector('select[name="vitamin"]');
      const hid = createForm.querySelector('input[name="suggested_from"]');
      if (sel) sel.value = String(vid);
      if (hid) hid.value = sf;
      createForm.scrollIntoView({ behavior: "smooth", block: "start" });
      sel?.focus();
      return;
    }

    if (action === "photo") {
      try {
        await api.patient.openVitaminIntakePhotoInNewTab(id);
      } catch (err) {
        showAlert("danger", err.message);
      }
      return;
    }

    if (action === "finish-intake") {
      const row = intakes.find((x) => Number(x.id) === id);
      if (!row) return;
      const form = modalEl.querySelector("#intake-edit-form");
      form.querySelector('input[name="id"]').value = String(id);
      form.querySelector('select[name="vitamin"]').value = String(row.vitamin ?? "");
      form.querySelector('input[name="started_on"]').value = String(row.started_on ?? "");
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      form.querySelector('input[name="ended_on"]').value = today;
      form.querySelector('input[name="dose_note"]').value = String(row.dose_note ?? "");
      form.querySelector('input[name="notes"]').value = String(row.notes ?? "");
      form.querySelector('input[name="photo"]').value = "";
      editModal.show();
      return;
    }

    if (action === "delete") {
      if (!confirm("Удалить курс?")) return;
      try {
        await api.patient.deleteVitaminIntake(id);
        showAlert("success", "Удалено");
        await refresh();
      } catch (err) {
        showAlert("danger", err.message);
      }
      return;
    }

    if (action === "edit") {
      const row = intakes.find((x) => Number(x.id) === id);
      if (!row) return;
      const form = modalEl.querySelector("#intake-edit-form");
      form.querySelector('input[name="id"]').value = String(id);
      form.querySelector('select[name="vitamin"]').value = String(row.vitamin ?? "");
      form.querySelector('input[name="started_on"]').value = String(row.started_on ?? "");
      form.querySelector('input[name="ended_on"]').value = row.ended_on ? String(row.ended_on) : "";
      form.querySelector('input[name="dose_note"]').value = String(row.dose_note ?? "");
      form.querySelector('input[name="notes"]').value = String(row.notes ?? "");
      form.querySelector('input[name="photo"]').value = "";
      editModal.show();
    }
  };
  pageEl._intakeHandler = onClick;
  pageEl.addEventListener("click", onClick);

  const editForm = pageEl.querySelector("#intake-edit-form");
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData(editForm);
      const pk = Number(fd.get("id"));
      const photo = fd.get("photo");
      const vid = Number(fd.get("vitamin"));
      if (!pk || !vid) return;
      const base = {
        vitamin: vid,
        started_on: fd.get("started_on"),
        ended_on: fd.get("ended_on") || null,
        dose_note: fd.get("dose_note") || "",
        notes: fd.get("notes") || "",
      };
      if (photo && photo.size) {
        const send = new FormData();
        send.append("vitamin", String(base.vitamin));
        send.append("started_on", base.started_on);
        if (base.ended_on) send.append("ended_on", base.ended_on);
        send.append("dose_note", base.dose_note);
        send.append("notes", base.notes);
        send.append("photo", photo);
        await api.patient.updateVitaminIntakeMultipart(pk, send);
      } else {
        await api.patient.updateVitaminIntake(pk, base);
      }
      editModal.hide();
      showAlert("success", "Сохранено");
      await refresh();
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  mountVitaminTrendChart(pageEl, tests);
}
