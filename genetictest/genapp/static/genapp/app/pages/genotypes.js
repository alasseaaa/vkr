import { getWithoutGeneticTestFlag } from "../services/wellness.js";

const PENDING_STORAGE_KEY = "genapp_genotypes_pending";

function makeNursePapi(api, patientId) {
  return {
    listGeneCatalog: () => api.patient.listGeneCatalog(),
    listGeneVariantCatalog: (p) => api.patient.listGeneVariantCatalog(p),
    listGenotypes: () => api.nurse.listPatientGenotypes(patientId),
    createGenotype: (p) => api.nurse.createPatientGenotype(patientId, p),
    updateGenotype: (id, p) => api.nurse.updatePatientGenotype(patientId, id, p),
    deleteGenotype: (id) => api.nurse.deletePatientGenotype(patientId, id),
  };
}

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

/** Подпись опции: символ + кратко имя/rs при наличии. */
function geneOptionLabel(g) {
  const sym = (g.symbol || "").trim() || `Ген #${g.id}`;
  const extra = (g.rs_id || "").trim();
  if (extra) return `${sym} (${extra})`;
  const fn = (g.full_name || "").trim();
  if (fn && fn.length <= 48) return `${sym} — ${fn}`;
  if (fn) return `${sym} — ${fn.slice(0, 45)}…`;
  return sym;
}

function geneMatchesQuery(g, q) {
  if (!q?.trim()) return true;
  const n = q.trim().toLowerCase();
  return (
    String(g.symbol || "").toLowerCase().includes(n) ||
    String(g.full_name || "").toLowerCase().includes(n) ||
    String(g.rs_id || "").toLowerCase().includes(n)
  );
}

function filterGenesByQuery(genes, q) {
  if (!q?.trim()) return genes;
  return genes.filter((g) => geneMatchesQuery(g, q));
}

function geneOptionsHtml(genes, emptyLabel) {
  const head = `<option value="">${emptyLabel}</option>`;
  if (!genes?.length) {
    return `${head}<option value="" disabled>Ничего не найдено</option>`;
  }
  return (
    head +
    genes.map((g) => `<option value="${g.id}">${escapeHtml(geneOptionLabel(g))}</option>`).join("")
  );
}

function variantOptionsHtml(variants) {
  if (!variants?.length) {
    return '<option value="">Нет вариантов для этого гена</option>';
  }
  return (
    '<option value="">Выберите вариант…</option>' +
    variants
      .map((v) => {
        const rt = riskLabel(v.risk_type);
        const line = v.genotype ? `${v.genotype} — ${rt}` : rt;
        return `<option value="${v.id}">${escapeHtml(line)}</option>`;
      })
      .join("")
  );
}

function fillGeneSelect(selectEl, genes, { preserveId, emptyLabel } = {}) {
  const prev = preserveId != null ? String(preserveId) : selectEl.value;
  selectEl.innerHTML = geneOptionsHtml(genes, emptyLabel);
  if (prev && genes.some((g) => String(g.id) === prev)) {
    selectEl.value = prev;
  } else {
    selectEl.value = "";
  }
}

function fillGeneDatalist(datalistEl, genes) {
  if (!datalistEl) return;
  datalistEl.innerHTML = (genes || [])
    .map((g) => {
      const sym = (g.symbol || "").trim();
      if (!sym) return "";
      const label = geneOptionLabel(g);
      return `<option value="${escapeHtml(sym)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

/** Гены, уже занятые сохранёнными строками или очередью (нельзя добавить второй раз тот же ген). */
function collectUsedGeneIds(genotypes, pending, allGenes) {
  const used = new Set();
  (genotypes || []).forEach((g) => {
    if (g.gene != null && Number.isFinite(Number(g.gene))) used.add(Number(g.gene));
  });
  (pending || []).forEach((p) => {
    if (p.gene_id != null && Number.isFinite(Number(p.gene_id))) {
      used.add(Number(p.gene_id));
    } else if (p.gene_symbol && allGenes?.length) {
      const sym = String(p.gene_symbol || "").trim().toLowerCase();
      const gg = allGenes.find((x) => String(x.symbol || "").trim().toLowerCase() === sym);
      if (gg) used.add(Number(gg.id));
    }
  });
  return used;
}

function genesAvailableForCreate(allGenes, genotypes, pending) {
  const used = collectUsedGeneIds(genotypes, pending, allGenes);
  return (allGenes || []).filter((g) => !used.has(Number(g.id)));
}

/** Для редактирования: текущий ген + гены, ещё не занятые другими сохранёнными строками. */
function genesAvailableForEdit(allGenes, genotypes, currentRow) {
  const curGid = currentRow?.gene != null ? Number(currentRow.gene) : null;
  const usedElsewhere = new Set();
  (genotypes || []).forEach((g) => {
    if (currentRow && Number(g.id) === Number(currentRow.id)) return;
    if (g.gene != null && Number.isFinite(Number(g.gene))) usedElsewhere.add(Number(g.gene));
  });
  return (allGenes || []).filter(
    (g) => (curGid != null && Number(g.id) === curGid) || !usedElsewhere.has(Number(g.id)),
  );
}

async function loadVariantsForGene(gapi, geneId) {
  if (!geneId) return [];
  const data = await gapi.listGeneVariantCatalog({ gene: geneId });
  return Array.isArray(data) ? data : [];
}

function wireGeneSearch({ searchInput, geneSelect, datalistEl, getGenes, onGeneCleared, emptyLabel }) {
  const applyFilter = () => {
    const pool = getGenes();
    const filtered = filterGenesByQuery(pool, searchInput.value);
    const hadGene = geneSelect.value;
    fillGeneDatalist(datalistEl, filtered);
    fillGeneSelect(geneSelect, filtered, { preserveId: hadGene, emptyLabel });
    if (!geneSelect.value && hadGene) {
      onGeneCleared?.();
    }
  };

  const syncSearchFromSelect = () => {
    const gid = geneSelect.value;
    const g = getGenes().find((x) => String(x.id) === gid);
    searchInput.value = g ? (g.symbol || "").trim() : "";
  };

  /** Выбор из подсказки datalist подставляет символ — синхронизируем с select. */
  const pickGeneBySymbolFromInput = () => {
    const raw = (searchInput.value || "").trim();
    if (!raw) return;
    const pool = getGenes();
    const n = raw.toLowerCase();
    const exact = pool.find((g) => String(g.symbol || "").trim().toLowerCase() === n);
    if (exact) {
      geneSelect.value = String(exact.id);
      searchInput.value = (exact.symbol || "").trim();
      geneSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  searchInput.addEventListener("input", applyFilter);
  searchInput.addEventListener("change", pickGeneBySymbolFromInput);
  geneSelect.addEventListener("change", () => {
    syncSearchFromSelect();
  });

  return applyFilter;
}

function variantLineFromSelect(optionEl) {
  if (!optionEl || !optionEl.value) return "";
  return optionEl.textContent?.trim() || "";
}

function statusUploadRu(s) {
  const m = { pending: "В очереди", processing: "В работе", done: "Обработано", rejected: "Отклонено" };
  return m[s] || s || "—";
}

export async function render(
  pageEl,
  {
    api,
    showAlert,
    patientId,
    patientLabel,
    backHref,
    uploadGeneticPdfs: allowPdfUpload = true,
    pdfTaskUploadId = null,
  } = {},
) {
  if (pageEl._genotypesClickHandler) {
    pageEl.removeEventListener("click", pageEl._genotypesClickHandler);
    pageEl._genotypesClickHandler = null;
  }

  const isNurse = patientId != null;
  const pendingKey =
    isNurse && Number.isFinite(Number(patientId))
      ? `${PENDING_STORAGE_KEY}_nurse_${Number(patientId)}`
      : PENDING_STORAGE_KEY;
  const readPend = () => {
    try {
      const raw = sessionStorage.getItem(pendingKey);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const writePend = (items) => {
    sessionStorage.setItem(pendingKey, JSON.stringify(items));
  };
  const papi = isNurse ? makeNursePapi(api, patientId) : api.patient;

  pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка…</div></div>`;

  let pdfTask = null;
  let pdfTaskErr = null;
  const shortWhen = (iso) => {
    if (iso == null || iso === "") return "—";
    const s = String(iso);
    return s.length >= 16 ? s.slice(0, 16).replace("T", " ") : s;
  };
  if (isNurse && pdfTaskUploadId != null) {
    const uir = Number(pdfTaskUploadId);
    if (Number.isFinite(uir) && uir > 0 && api.nurse?.getGeneticReport) {
      try {
        let t = await api.nurse.getGeneticReport(uir);
        if (t && Number(t.patient_id) !== Number(patientId)) {
          pdfTaskErr = "mismatch";
        } else {
          pdfTask = t;
          if (t && t.status === "pending" && api.nurse.patchGeneticReport) {
            try {
              await api.nurse.patchGeneticReport(uir, { status: "processing" });
              t = await api.nurse.getGeneticReport(uir);
              pdfTask = t;
            } catch {
              /* оставляем исходный t */
            }
          }
        }
      } catch {
        pdfTask = null;
      }
    }
  }

  const nursePdfTaskBanner = (() => {
    if (!isNurse || !pdfTaskUploadId) return "";
    if (pdfTaskErr === "mismatch") {
      return `<div class="alert alert-warning border-0 shadow-sm mb-3" role="alert">
        <strong>Эта заявка от другого пациента.</strong>
        PDF №${escapeHtml(String(pdfTaskUploadId))} не относится к открытой карточке. Откройте заявку из
        <a href="#/nurse/genetic-uploads" class="alert-link">списка PDF</a> или
        <a href="#/nurse/profile" class="alert-link">рабочего стола</a>.
      </div>`;
    }
    if (!api.nurse?.getGeneticReport) return "";
    if (pdfTaskUploadId && !pdfTask) {
      return `<div class="alert alert-light border small mb-3">Не удалось загрузить заявку #${escapeHtml(
        String(pdfTaskUploadId),
      )} (проверьте сеть и обновите страницу).</div>`;
    }
    if (!pdfTask) return "";
    if (pdfTask.status === "done" || pdfTask.status === "rejected") {
      const done = pdfTask.status === "done";
      return `<div class="card app-card shadow-sm mb-3 border-${done ? "success" : "secondary"}">
        <div class="card-body d-flex flex-wrap align-items-start gap-3">
          <div class="rounded-circle bg-${done ? "success" : "secondary"} bg-opacity-10 p-2">
            <i class="bi ${
              done ? "bi-check-lg text-success" : "bi-x-lg text-secondary"
            } fs-4"></i>
          </div>
          <div class="flex-grow-1 min-w-0">
            <div class="fw-semibold">${done ? "Ввод по PDF завершён" : "Заявка отклонена"}</div>
            <p class="text-muted small mb-0">Заявка №${escapeHtml(String(pdfTask.id))} — ${
              done ? "варианты внесены в карточку" : "не принята к вводу"
            }.<br />
            <span class="text-muted">${done ? "Закрыта" : "Статус"}: ${escapeHtml(
              shortWhen(pdfTask.updated_at),
            )}${
              done && pdfTask.processed_by_username
                ? ` · ${escapeHtml(pdfTask.processed_by_username)}`
                : ""
            }</span></p>
          </div>
        </div>
      </div>`;
    }
    return `<div class="card app-card shadow-sm mb-3 border-primary border-opacity-25">
      <div class="card-body">
        <div class="fw-semibold mb-1">Перенос вариантов с PDF (заявка №${escapeHtml(String(pdfTask.id))})</div>
        <p class="text-muted small mb-3">Сейчас: <span class="badge ${
          pdfTask.status === "processing" ? "text-bg-info" : "text-bg-secondary"
        }">${escapeHtml(statusUploadRu(pdfTask.status))}</span> — внесите строки в таблицу ниже, затем нажмите кнопку.</p>
        <button type="button" class="btn btn-success btn-sm" id="nurse-pdf-mark-done" data-up="${escapeHtml(
          String(pdfTask.id),
        )}">
          <i class="bi bi-check2-circle me-1"></i>Варианты внесены, закрыть заявку
        </button>
        <p class="text-muted small mt-2 mb-0">Статус заявки сменится на «Обработано» — в списках она отобразится как завершённая.</p>
      </div>
    </div>`;
  })();

  let genes = [];
  let uploads = [];
  try {
    const ps = [papi.listGeneCatalog().catch(() => [])];
    if (!isNurse && allowPdfUpload) {
      const listFn = api.patient && api.patient.listGeneticReports;
      ps.push(
        typeof listFn === "function"
          ? listFn.call(api.patient).catch(() => [])
          : Promise.resolve([]),
      );
    } else {
      ps.push(Promise.resolve([]));
    }
    const [g, u] = await Promise.all(ps);
    genes = Array.isArray(g) ? g : [];
    uploads = Array.isArray(u) ? u : [];
  } catch (e) {
    showAlert("danger", e.message);
  }

  genes.sort((a, b) => String(a.symbol || "").localeCompare(String(b.symbol || ""), "ru"));

  const load = async () => {
    const data = await papi.listGenotypes();
    return Array.isArray(data) ? data : [];
  };

  let genotypes = await load();
  let pending = readPend();

  const refresh = async () => {
    genotypes = await load();
    pending = readPend();
    await render(pageEl, {
      api,
      showAlert,
      patientId,
      patientLabel,
      backHref,
      uploadGeneticPdfs: allowPdfUpload,
      pdfTaskUploadId,
    });
  };

  const geneEmpty = "Выберите ген…";
  const genesForCreate = genesAvailableForCreate(genes, genotypes, pending);
  let genesForEditList = genes;

  const pendingRowsHtml = () =>
    pending.length
      ? pending
          .map(
            (p, idx) => `
        <tr>
          <td>${escapeHtml(p.gene_symbol || "")}</td>
          <td>${escapeHtml(p.line || "")}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-pending" data-index="${idx}">
              Убрать
            </button>
          </td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="3" class="text-center text-muted py-3">Добавьте варианты кнопкой «В список»</td></tr>`;

  const wellnessBanner =
    !isNurse && getWithoutGeneticTestFlag()
      ? `<div class="alert alert-info border-0 bg-info bg-opacity-10 small mb-3">У вас включён режим «без генетического теста». Раздел доступен по прямой ссылке; чтобы скрыть его в меню снова, снимите галочку в <a href="#/profile">профиле</a>.</div>`
      : "";
  const backNurse = (backHref || "#/nurse/profile").replace(/^#/, "");
  const nurseContextBar = isNurse
    ? `<div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <a class="btn btn-sm btn-outline-secondary" href="#${backNurse}">← К заявкам</a>
        <span class="text-secondary small">Пациент: <strong>${escapeHtml(
          patientLabel || "—",
        )}</strong></span>
      </div>`
    : "";
  const pdfBlock =
    isNurse || !allowPdfUpload
      ? ""
      : `<div class="card app-card shadow-sm mb-3" id="card-pdf-upload">
      <div class="card-header bg-white">
        <div class="fw-semibold">Скан или PDF</div>
        <div class="text-muted small">Прикрепите PDF с результатами анализов. Медсестра получит уведомление и внесёт варианты в ваш профиль. До 5 МБ, только .pdf</div>
      </div>
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <input type="file" id="input-genetic-pdf" class="d-none" accept="application/pdf,.pdf" />
          <button type="button" class="btn btn-primary btn-sm" id="btn-pick-pdf">
            <i class="bi bi-file-earmark-arrow-up me-1"></i>Выбрать PDF
          </button>
        </div>
        <div class="table-responsive border rounded mt-3">
          <table class="table table-sm align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Дата</th>
                <th>Статус</th>
                <th>Примечание</th>
                <th class="text-end">Действия</th>
              </tr>
            </thead>
            <tbody>
              ${
                uploads.length
                  ? uploads
                      .map(
                        (r) => `
                <tr>
                  <td>${escapeHtml((r.created_at != null && String(r.created_at).length >= 10
                    ? String(r.created_at).slice(0, 10)
                    : "—") || "—")}</td>
                  <td>${escapeHtml(statusUploadRu(r.status))}</td>
                  <td class="text-muted small">${escapeHtml(
                    (r.admin_note && String(r.admin_note).trim()) || "—",
                  )}</td>
                  <td class="text-end text-nowrap">
                    <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="view-pdf" data-upload-id="${r.id}" title="Просмотреть PDF" ${r.id != null && Number(r.id) > 0 ? "" : "disabled"}>
                      <i class="bi bi-eye me-0"></i> Смотреть
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-pdf" data-upload-id="${r.id}" title="${r.can_delete ? "Удалить" : "После обработки"}" ${r.can_delete ? "" : "disabled"}>
                      Удалить
                    </button>
                  </td>
                </tr>`,
                      )
                      .join("")
                  : '<tr><td colspan="4" class="text-center text-muted py-3">Нет прикреплённых файлов</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  pageEl.innerHTML = `
    <div class="app-page">
    ${nurseContextBar}
    ${nursePdfTaskBanner}
    ${wellnessBanner}
    <div class="app-page-header d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h1 class="app-page-title h3 mb-0">Генетические данные</h1>
      ${
        !isNurse
          ? '<a class="btn btn-outline-secondary btn-sm" href="#/passport">Открыть паспорт</a>'
          : ""
      }
    </div>

    ${pdfBlock}

    <div class="card app-card shadow-sm mb-3">
      <div class="card-header bg-white">
        <div class="fw-semibold">Добавить варианты</div>
        <div class="text-muted small">Введите <strong>символ</strong>, название или rsID — подсказки появятся при вводе; гены, которые уже есть ${
          isNurse ? "у пациента" : "у вас"
        } в таблице или в очереди ниже, в списке не показываются. Выберите вариант и нажмите «В список».</div>
      </div>
      <div class="card-body">
        ${
          genes.length && !genesForCreate.length
            ? `<div class="alert alert-light border small mb-3 mb-lg-0">Все доступные гены уже добавлены в сохранённые данные или в очередь на сохранение. Чтобы добавить другой ген, удалите или измените существующую запись.</div>`
            : ""
        }
        <div class="row g-3 align-items-end">
          <div class="col-lg-5">
            <label class="form-label small mb-1">Ген (поиск)</label>
            <input type="search" id="create-gene-search" class="form-control form-control-sm mb-2" placeholder="Символ, название или rsID…" autocomplete="off" list="create-gene-datalist" ${genes.length ? "" : "disabled"} />
            <datalist id="create-gene-datalist"></datalist>
            <select id="create-gene-select" class="form-select" ${genes.length ? "" : "disabled"}>${geneOptionsHtml(genesForCreate, geneEmpty)}</select>
          </div>
          <div class="col-lg-4">
            <label class="form-label small mb-1">Вариант гена</label>
            <select id="create-variant-select" class="form-select" disabled>
              <option value="">Сначала выберите ген</option>
            </select>
          </div>
          <div class="col-lg-3">
            <button type="button" class="btn btn-outline-primary w-100 mb-2" id="btn-add-pending" disabled>
              <i class="bi bi-plus-lg me-1"></i>В список
            </button>
          </div>
        </div>

        <div class="table-responsive border rounded mt-3">
          <table class="table table-sm mb-0 align-middle">
            <thead class="table-light">
              <tr>
                <th>Ген</th>
                <th>Вариант</th>
                <th class="text-end">Очередь</th>
              </tr>
            </thead>
            <tbody id="pending-tbody">
              ${pendingRowsHtml()}
            </tbody>
          </table>
        </div>
        <div class="d-grid gap-2 mt-3">
          <button type="button" class="btn btn-primary btn-lg" id="btn-save-passport" ${pending.length ? "" : "disabled"}>
            <i class="bi bi-check2-circle me-2"></i>${isNurse ? "Сохранить в профиль пациента" : "Сохранить и открыть паспорт"}
          </button>
        </div>
      </div>
    </div>

    <div class="card app-card shadow-sm">
      <div class="card-header bg-white">
        <div class="fw-semibold">Уже сохранённые генотипы</div>
      </div>
      <div class="card-body p-0">
        <table class="table table-hover mb-0 align-middle">
          <thead class="table-light">
            <tr>
              <th>ID</th>
              <th>Ген</th>
              <th>Вариант</th>
              <th>Риск</th>
              <th>Добавлен</th>
              <th class="text-end">Действия</th>
            </tr>
          </thead>
          <tbody>
            ${
              genotypes.length
                ? genotypes
                    .map(
                      (g) => `
                <tr>
                  <td class="text-muted">${g.id}</td>
                  <td>${escapeHtml(g.gene_symbol || "")}</td>
                  <td>${escapeHtml(g.variant_genotype || "")}</td>
                  <td>${escapeHtml(g.risk_type ? riskLabel(g.risk_type) : "")}</td>
                  <td>${escapeHtml(g.created_at ? String(g.created_at).slice(0, 10) : "")}</td>
                  <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-id="${g.id}">Изменить</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${g.id}">Удалить</button>
                  </td>
                </tr>
              `,
                    )
                    .join("")
                : `<tr><td colspan="6" class="text-center text-muted py-4">Пока нет данных</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div id="edit-modal" class="modal" tabindex="-1" style="display:none">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Редактирование</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body">
            <form id="edit-form">
              <input type="hidden" name="id" />
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label small mb-1">Ген (поиск)</label>
                  <input type="search" id="edit-gene-search" class="form-control form-control-sm mb-2" placeholder="Символ, название или rsID…" autocomplete="off" list="edit-gene-datalist" />
                  <datalist id="edit-gene-datalist"></datalist>
                  <select id="edit-gene-select" class="form-select"></select>
                </div>
                <div class="col-md-6">
                  <label class="form-label small mb-1">Вариант гена</label>
                  <select name="gene_variant" id="edit-variant-select" class="form-select" disabled required>
                    <option value="">Сначала выберите ген</option>
                  </select>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" form="edit-form" type="submit" id="edit-submit" disabled>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  const pendingTbody = pageEl.querySelector("#pending-tbody");
  const btnSavePassport = pageEl.querySelector("#btn-save-passport");
  const btnAddPending = pageEl.querySelector("#btn-add-pending");
  const btnPickPdf = pageEl.querySelector("#btn-pick-pdf");
  const inputGeneticPdf = pageEl.querySelector("#input-genetic-pdf");

  const btnNursePdfDone = pageEl.querySelector("#nurse-pdf-mark-done");
  if (btnNursePdfDone && isNurse && api.nurse?.patchGeneticReport) {
    btnNursePdfDone.addEventListener("click", async () => {
      const up = Number(btnNursePdfDone.dataset.up);
      if (!up) return;
      btnNursePdfDone.disabled = true;
      try {
        await api.nurse.patchGeneticReport(up, { status: "done" });
        showAlert("success", "Заявка закрыта: ввод по PDF отмечен как завершённый.");
        await refresh();
      } catch (e) {
        showAlert("danger", e?.message || "Ошибка");
        btnNursePdfDone.disabled = false;
      }
    });
  }

  if (btnPickPdf && inputGeneticPdf && !isNurse) {
    btnPickPdf.addEventListener("click", () => inputGeneticPdf.click());
    inputGeneticPdf.addEventListener("change", async () => {
      const f = inputGeneticPdf.files && inputGeneticPdf.files[0];
      if (!f) return;
      btnPickPdf.disabled = true;
      try {
        const up = api.patient && api.patient.uploadGeneticReportPdf;
        if (typeof up !== "function") {
          showAlert(
            "warning",
            "Старая версия кэша страницы. Обновите приложение (Ctrl+F5) и откройте снова.",
          );
          return;
        }
        await up.call(api.patient, f);
        showAlert("success", "PDF отправлен. Медсестра получит уведомление.");
        await refresh();
      } catch (e) {
        showAlert("danger", e?.message || "Ошибка загрузки");
      } finally {
        btnPickPdf.disabled = false;
        inputGeneticPdf.value = "";
      }
    });
  }

  let createApplyFilter = () => {};

  const syncPendingUi = () => {
    pending = readPend();
    if (pendingTbody) pendingTbody.innerHTML = pendingRowsHtml();
    if (btnSavePassport) btnSavePassport.disabled = !pending.length;
    createApplyFilter();
  };

  const createGeneSearch = pageEl.querySelector("#create-gene-search");
  const createGeneSelect = pageEl.querySelector("#create-gene-select");
  const createVariantSelect = pageEl.querySelector("#create-variant-select");

  const resetCreateVariant = () => {
    createVariantSelect.innerHTML = '<option value="">Сначала выберите ген</option>';
    createVariantSelect.disabled = true;
    btnAddPending.disabled = true;
  };

  const syncAddPendingBtn = () => {
    btnAddPending.disabled = !createVariantSelect.value || createVariantSelect.disabled;
  };

  const createGeneDatalist = pageEl.querySelector("#create-gene-datalist");

  if (genes.length) {
    const runCreateFilter = wireGeneSearch({
      searchInput: createGeneSearch,
      geneSelect: createGeneSelect,
      datalistEl: createGeneDatalist,
      getGenes: () => genesAvailableForCreate(genes, genotypes, readPend()),
      emptyLabel: geneEmpty,
      onGeneCleared: resetCreateVariant,
    });
    createApplyFilter = () => {
      runCreateFilter();
      const pool = genesAvailableForCreate(genes, genotypes, readPend());
      const allow = pool.length > 0;
      createGeneSearch.disabled = !allow;
      createGeneSelect.disabled = !allow;
    };
    createApplyFilter();

    createGeneSelect.addEventListener("change", async () => {
      const gid = createGeneSelect.value;
      if (!gid) {
        resetCreateVariant();
        return;
      }
      createVariantSelect.disabled = true;
      createVariantSelect.innerHTML = '<option value="">Загрузка…</option>';
      btnAddPending.disabled = true;
      try {
        const vars = await loadVariantsForGene(papi, gid);
        createVariantSelect.innerHTML = variantOptionsHtml(vars);
        createVariantSelect.disabled = !vars.length;
      } catch (err) {
        showAlert("danger", err.message);
        createVariantSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        createVariantSelect.disabled = true;
      }
      syncAddPendingBtn();
    });

    createVariantSelect.addEventListener("change", syncAddPendingBtn);
  }

  btnAddPending.addEventListener("click", () => {
    const vid = Number(createVariantSelect.value);
    if (!vid) return;

    const gid = Number(createGeneSelect.value);
    const sym =
      genes.find((g) => String(g.id) === createGeneSelect.value)?.symbol || createGeneSelect.selectedOptions[0]?.text || "";
    const opt = createVariantSelect.selectedOptions[0];
    const line = variantLineFromSelect(opt);

    if (genotypes.some((g) => Number(g.gene_variant) === vid)) {
      showAlert("warning", "Такой вариант уже есть в сохранённых данных.");
      return;
    }
    if (pending.some((p) => Number(p.gene_variant) === vid)) {
      showAlert("warning", "Этот вариант уже в списке.");
      return;
    }
    if (Number.isFinite(gid) && genotypes.some((g) => Number(g.gene) === gid)) {
      showAlert("warning", "Ген уже добавлен в сохранённые данные.");
      return;
    }
    if (Number.isFinite(gid) && pending.some((p) => Number(p.gene_id) === gid)) {
      showAlert("warning", "Ген уже есть в очереди.");
      return;
    }

    pending.push({ gene_variant: vid, gene_id: Number.isFinite(gid) ? gid : null, gene_symbol: sym, line });
    writePend(pending);
    syncPendingUi();
    showAlert("success", "Добавлено в список. Продолжайте или сохраните.");

    createGeneSearch.value = "";
    resetCreateVariant();
  });

  btnSavePassport.addEventListener("click", async () => {
    const queue = readPend();
    if (!queue.length) return;

    btnSavePassport.disabled = true;
    const failed = [];
    for (const p of queue) {
      try {
        await papi.createGenotype({ gene_variant: p.gene_variant });
      } catch (err) {
        failed.push({ ...p, error: err.message });
      }
    }

    if (failed.length === queue.length) {
      showAlert("danger", failed.map((f) => `${f.gene_symbol}: ${f.error}`).join("; "));
      btnSavePassport.disabled = false;
      return;
    }

    const remaining = failed.map((f) => ({
      gene_variant: f.gene_variant,
      gene_id: f.gene_id,
      gene_symbol: f.gene_symbol,
      line: f.line,
    }));
    writePend(remaining);

    if (remaining.length) {
      showAlert(
        "warning",
        `Сохранено ${queue.length - remaining.length} из ${queue.length}. Исправьте ошибки для оставшихся записей.`,
      );
      await refresh();
      return;
    }

    sessionStorage.removeItem(pendingKey);
    if (isNurse) {
      showAlert("success", "Данные пациента сохранены");
      await refresh();
    } else {
      showAlert("success", "Данные сохранены");
      window.location.hash = "#/passport";
    }
  });

  const modalEl = pageEl.querySelector("#edit-modal");
  const editModal = new bootstrap.Modal(modalEl, {});
  const editGeneSearch = modalEl.querySelector("#edit-gene-search");
  const editGeneSelect = modalEl.querySelector("#edit-gene-select");
  const editVariantSelect = modalEl.querySelector("#edit-variant-select");
  const editSubmit = modalEl.querySelector("#edit-submit");

  const resetEditVariant = () => {
    editVariantSelect.innerHTML = '<option value="">Сначала выберите ген</option>';
    editVariantSelect.disabled = true;
    editSubmit.disabled = true;
  };

  const syncEditSubmit = () => {
    editSubmit.disabled = !editVariantSelect.value || editVariantSelect.disabled;
  };

  const editGeneDatalist = modalEl.querySelector("#edit-gene-datalist");
  let editFilterApply = () => {};
  if (genes.length) {
    editFilterApply = wireGeneSearch({
      searchInput: editGeneSearch,
      geneSelect: editGeneSelect,
      datalistEl: editGeneDatalist,
      getGenes: () => genesForEditList,
      emptyLabel: geneEmpty,
      onGeneCleared: resetEditVariant,
    });
    fillGeneSelect(editGeneSelect, genesForEditList, { emptyLabel: geneEmpty });
    fillGeneDatalist(editGeneDatalist, genesForEditList);

    editGeneSelect.addEventListener("change", async () => {
      const gid = editGeneSelect.value;
      if (!gid) {
        resetEditVariant();
        return;
      }
      editVariantSelect.disabled = true;
      editVariantSelect.innerHTML = '<option value="">Загрузка…</option>';
      editSubmit.disabled = true;
      try {
        const vars = await loadVariantsForGene(papi, gid);
        editVariantSelect.innerHTML = variantOptionsHtml(vars);
        editVariantSelect.disabled = !vars.length;
      } catch (err) {
        showAlert("danger", err.message);
        editVariantSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
      }
      syncEditSubmit();
    });

    editVariantSelect.addEventListener("change", syncEditSubmit);
  }

  const onPageClick = async (e) => {
    const pendingBtn = e.target.closest("button[data-action='remove-pending']");
    if (pendingBtn) {
      const idx = Number(pendingBtn.dataset.index);
      pending = readPend();
      pending.splice(idx, 1);
      writePend(pending);
      syncPendingUi();
      return;
    }

    const viewPdf = e.target.closest("button[data-action='view-pdf']");
    if (viewPdf) {
      if (isNurse) return;
      const uid = Number(viewPdf.dataset.uploadId);
      if (!Number.isFinite(uid) || uid <= 0) return;
      try {
        if (typeof api.patient.openGeneticReportPdfInNewTab === "function") {
          await api.patient.openGeneticReportPdfInNewTab(uid);
        } else {
          showAlert("warning", "Обновите страницу (Ctrl+F5) и откройте снова.");
        }
      } catch (err) {
        showAlert("danger", err?.message || "Ошибка");
      }
      return;
    }
    const delPdf = e.target.closest("button[data-action='delete-pdf']");
    if (delPdf) {
      if (isNurse) return;
      if (delPdf.disabled) return;
      const uid = Number(delPdf.dataset.uploadId);
      if (!Number.isFinite(uid) || uid <= 0) return;
      if (!confirm("Удалить прикреплённый PDF?")) return;
      try {
        if (typeof api.patient.deleteGeneticReport === "function") {
          await api.patient.deleteGeneticReport(uid);
        } else {
          showAlert("warning", "Обновите страницу (Ctrl+F5).");
          return;
        }
        showAlert("success", "Файл удалён");
        await refresh();
      } catch (err) {
        showAlert("danger", err?.message || "Ошибка");
      }
      return;
    }

    const btn = e.target.closest("button[data-action]");
    if (!btn || btn.dataset.action === "remove-pending") return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === "delete") {
      if (!confirm("Удалить генотип?")) return;
      try {
        await papi.deleteGenotype(id);
        showAlert("success", "Удалено");
        await refresh();
      } catch (err) {
        showAlert("danger", err.message);
      }
    }

    if (action === "edit") {
      const row = genotypes.find((x) => Number(x.id) === id);
      modalEl.querySelector('input[name="id"]').value = String(id);

      if (!genes.length) {
        showAlert("warning", "Справочник генов недоступен");
        return;
      }

      genesForEditList = genesAvailableForEdit(genes, genotypes, row);
      editGeneSearch.value = "";
      editFilterApply();
      const geneId = row?.gene != null ? String(row.gene) : "";
      if (geneId && genesForEditList.some((g) => String(g.id) === geneId)) {
        editGeneSelect.value = geneId;
        editGeneSearch.value = (genes.find((g) => String(g.id) === geneId)?.symbol || "").trim();
      } else {
        editGeneSelect.value = "";
      }

      resetEditVariant();
      if (editGeneSelect.value) {
        editVariantSelect.innerHTML = '<option value="">Загрузка…</option>';
        try {
          const vars = await loadVariantsForGene(papi, editGeneSelect.value);
          editVariantSelect.innerHTML = variantOptionsHtml(vars);
          editVariantSelect.disabled = !vars.length;
          if (row?.gene_variant != null) {
            editVariantSelect.value = String(row.gene_variant);
          }
        } catch (err) {
          showAlert("danger", err.message);
        }
      }
      syncEditSubmit();
      editModal.show();
    }
  };
  pageEl._genotypesClickHandler = onPageClick;
  pageEl.addEventListener("click", onPageClick);

  const editForm = pageEl.querySelector("#edit-form");
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const formData = Object.fromEntries(new FormData(editForm).entries());
      const recId = Number(formData.id);
      const vid = Number(editVariantSelect.value);
      if (!vid) return;
      await papi.updateGenotype(recId, { gene_variant: vid });
      editModal.hide();
      showAlert("success", "Сохранено");
      await refresh();
    } catch (err) {
      showAlert("danger", err.message);
    }
  });
}
