function statusBadge(status) {
  if (status === "Дефицит") return `<span class="badge bg-danger badge-status">${status}</span>`;
  if (status === "Норма") return `<span class="badge bg-success badge-status">${status}</span>`;
  if (status === "Профицит") return `<span class="badge bg-warning text-dark badge-status">${status}</span>`;
  return `<span class="badge bg-secondary badge-status">${status || "—"}</span>`;
}

function commentStatusBadge(status) {
  if (status === "published") return `<span class="badge bg-success">✅ Опубликован</span>`;
  if (status === "draft") return `<span class="badge bg-secondary">📝 Черновик</span>`;
  if (status === "deleted") return `<span class="badge bg-danger">❌ Удалён</span>`;
  return `<span class="badge bg-secondary">${status || "—"}</span>`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateRu(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dateKey(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function ageText(birthDate) {
  if (!birthDate) return "—";
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 0) return "—";
  const mod10 = age % 10;
  const mod100 = age % 100;
  let word = "лет";
  if (mod10 === 1 && mod100 !== 11) word = "год";
  else if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) word = "года";
  return `${age} ${word}`;
}

function genderLabel(raw) {
  if (raw === "male") return "Мужской";
  if (raw === "female") return "Женский";
  return raw || "—";
}

function commentType(c) {
  if (c?.genetic_result_id) return "genotype";
  if (c?.vitamin_reading_id) return "vitamin";
  return "general";
}

function commentTypeMeta(c) {
  const t = commentType(c);
  if (t === "genotype") return { icon: "bi-dna", cls: "comment-genotype", title: "К генотипу" };
  if (t === "vitamin") return { icon: "bi-droplet", cls: "comment-vitamin", title: "К витамину" };
  return { icon: "bi-chat", cls: "comment-general", title: "Общий" };
}

function activityBadge(comments) {
  const now = Date.now();
  const hasFreshComment = (comments || []).some((c) => now - dateKey(c.created_at) < 3 * 24 * 3600 * 1000);
  if (hasFreshComment) return '<span class="badge text-bg-warning">Новые комментарии</span>';
  return "";
}

function groupLabel(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Ранее";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yStart = todayStart - 24 * 3600 * 1000;
  const t = d.getTime();
  if (t >= todayStart) return "Сегодня";
  if (t >= yStart) return "Вчера";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (now.getFullYear() === yyyy) return `${dd}.${mm}`;
  return `${dd}.${mm}.${yyyy}`;
}

function renderCommentChip() {
  return '<button type="button" class="btn btn-sm btn-link p-0 text-secondary" title="Добавить комментарий"><i class="bi bi-plus-circle"></i></button>';
}

function readSeenTs(key) {
  try {
    const raw = localStorage.getItem(key);
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function writeSeenTs(key, ts) {
  try {
    localStorage.setItem(key, String(ts));
  } catch {
    /* */
  }
}

export async function render(pageEl, { api, route, showAlert }) {
  const patientId = route.patientId;
  const seenKey = `doctor_patient_profile_seen_${patientId}`;
  const seenTs = readSeenTs(seenKey);
  pageEl.innerHTML = `<div class="card"><div class="card-body">Загрузка профиля пациента #${patientId}...</div></div>`;

  let profile;
  try {
    profile = await api.doctor.getProfile(patientId);
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    return;
  }

  const patient = profile?.patient || {};
  const patientProfile = patient?.profile || {};
  const genotypes = profile?.genotypes || [];
  const vitaminTests = profile?.vitamin_tests || [];
  let comments = [];
  const state = {
    filter: "all",
    query: "",
    page: 1,
    pageSize: 5,
    total: 0,
    loading: false,
    genotypeQuery: "",
    genotypeRisk: "",
    vitaminQuery: "",
    vitaminStatus: "",
  };

  const fullName = patient?.full_name || `${patient?.last_name || ""} ${patient?.first_name || ""}`.trim() || patient?.username || "Пациент";
  const newGenCount = genotypes.filter((g) => dateKey(g.created_at || g.updated_at) > seenTs).length;
  const newVitCount = vitaminTests.filter((t) => dateKey(t.test_date || t.created_at || t.updated_at) > seenTs).length;

  const buildActivityLine = () => {
    const profileUpdated = patientProfile?.updated_at ? formatDateRu(patientProfile.updated_at) : "—";
    const latestGen = [...genotypes].sort((a, b) => dateKey(b.created_at) - dateKey(a.created_at))[0];
    const latestVit = [...vitaminTests].sort((a, b) => dateKey(b.created_at || b.test_date) - dateKey(a.created_at || a.test_date))[0];
    return `
      <div class="doctor-patient-activity small text-muted mb-3">
        <i class="bi bi-file-earmark-text me-1 text-primary"></i>Профиль: ${escapeHtml(profileUpdated)}
        <span class="mx-2">|</span>
        <i class="bi bi-dna me-1 text-primary"></i>Ген: ${escapeHtml(latestGen?.gene_symbol || "—")} (${escapeHtml(formatDateRu(latestGen?.created_at)).slice(0, 5)})
        <span class="mx-2">|</span>
        <i class="bi bi-droplet me-1 text-success"></i>Витамин: ${escapeHtml(latestVit?.vitamin_name || "—")} (${escapeHtml(formatDateRu(latestVit?.test_date || latestVit?.created_at)).slice(0, 5)})
      </div>
    `;
  };

  const html = `
    <style>
      .doctor-patient-header { border-radius: 14px; }
      .doctor-patient-actions .btn { min-width: 170px; }
      .comment-row { border-radius: 10px; border-left-width: 3px !important; }
      .comment-genotype { border-left-color: #0d6efd !important; }
      .comment-vitamin { border-left-color: #198754 !important; }
      .comment-general { border-left-color: #6c757d !important; }
      .anchor-block { scroll-margin-top: 12px; }
      .comment-toggle-line { user-select: none; }
      .tiny-link-btn { border: none; background: transparent; padding: 0; }
      .doctor-table-scroll { max-height: 200px; overflow-y: auto; }
      .doctor-table-scroll thead th { position: sticky; top: 0; z-index: 2; background: var(--bs-light); }
      .comments-grid { display: grid; grid-template-columns: 1fr; gap: .5rem; }
      @media (min-width: 1200px) {
        .comments-grid { grid-template-columns: 1fr 1fr; gap: .75rem; }
      }
      .comments-group-title { grid-column: 1 / -1; }
    </style>

    <div class="d-flex align-items-center justify-content-between mb-2">
      <a class="btn btn-outline-secondary btn-sm" href="#/doctor/patients">← Назад к списку</a>
    </div>

    <div class="card shadow-sm mb-3 doctor-patient-header">
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div>
            <h2 class="mb-1">${escapeHtml(fullName)}</h2>
            <div class="small text-muted d-flex flex-wrap gap-3">
              <span><strong>Дата рождения:</strong> ${escapeHtml(formatDateRu(patientProfile?.birth_date))} (${escapeHtml(ageText(patientProfile?.birth_date))})</span>
              <span><strong>Пол:</strong> ${escapeHtml(genderLabel(patientProfile?.gender))}</span>
              <span>${activityBadge(comments)}</span>
            </div>
          </div>
          <div class="doctor-patient-actions d-flex flex-wrap gap-2">
            <button class="btn btn-primary btn-sm" type="button" id="btn-jump-comment">➕ Добавить комментарий</button>
          </div>
        </div>
      </div>
    </div>

    ${
      newGenCount || newVitCount
        ? `<div class="alert alert-warning py-2 small mb-2">
      С прошлого просмотра добавлено: ${newGenCount ? `генотипов — ${newGenCount}` : "генотипов — 0"}${newGenCount && newVitCount ? ", " : ""}${newVitCount ? `анализов — ${newVitCount}` : "анализов — 0"}.
    </div>`
        : ""
    }

    ${buildActivityLine()}

    <div class="row g-3">
      <div class="col-lg-5">
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-white fw-semibold">Данные пациента</div>
          <div class="card-body">
            <div class="mb-2"><span class="text-muted small">Рост:</span> ${escapeHtml(patientProfile?.height ?? "—")} см</div>
            <div class="mb-2"><span class="text-muted small">Вес:</span> ${escapeHtml(patientProfile?.weight ?? "—")} кг</div>
            <div class="mb-2"><span class="text-muted small">Активность:</span> ${escapeHtml(patientProfile?.activity_level ?? "—")}</div>
            <div class="mb-2"><span class="text-muted small">Питание:</span> ${escapeHtml(patientProfile?.diet_preferences || "—")}</div>
          </div>
        </div>

        <div class="card shadow-sm anchor-block" id="comment-form-anchor">
          <div class="card-header bg-white fw-semibold d-flex align-items-center justify-content-between">
            <span>Комментарий врача</span>
            <button class="btn btn-sm btn-outline-secondary" type="button" id="btn-expand-comment">Развернуть</button>
          </div>
          <div class="card-body">
            <form id="comment-form">
              <div class="mb-2">
                <label class="form-label small">Текст</label>
                <textarea name="text" class="form-control" rows="4" required placeholder="Комментарий врача..."></textarea>
              </div>
              <div class="form-check form-switch mb-2 comment-toggle-line">
                <input class="form-check-input" type="checkbox" id="comment-publish-toggle" checked />
                <label class="form-check-label small" for="comment-publish-toggle">Опубликовать сразу</label>
              </div>
              <button class="btn btn-primary w-100" type="submit"><i class="bi bi-chat-left-text me-1"></i>Опубликовать</button>

              <div class="mt-2">
                <button type="button" class="tiny-link-btn text-primary small" id="btn-bind-comment">Привязать к генотипу или витамину</button>
              </div>

              <div id="comment-bind-zone" class="mt-2 d-none">
                <div class="mb-2">
                  <label class="form-label small">К чему относится комментарий</label>
                  <select name="scope" class="form-select">
                    <option value="patient" selected>Пациент в целом</option>
                    <option value="genotype">Конкретный генотип</option>
                    <option value="vitamin_test">Анализ витамина</option>
                  </select>
                </div>
                <div id="scope-genotype" class="mb-2 d-none">
                  <label class="form-label small">Генотип</label>
                  <select name="genotype" class="form-select">
                    ${genotypes.length ? genotypes.map((g) => `<option value="${g.id}">${escapeHtml(g.gene_symbol || "")} ${escapeHtml(g.variant_genotype || "")}</option>`).join("") : `<option value="">Нет данных</option>`}
                  </select>
                </div>
                <div id="scope-vitamin" class="mb-2 d-none">
                  <label class="form-label small">Анализ витамина</label>
                  <select name="vitamin_test" class="form-select">
                    ${vitaminTests.length ? vitaminTests.map((t) => `<option value="${t.id}">${escapeHtml(t.vitamin_name || "")} (${escapeHtml(t.test_value)})</option>`).join("") : `<option value="">Нет данных</option>`}
                  </select>
                </div>
              </div>
            </form>
          </div>
        </div>

      </div>

      <div class="col-lg-7">
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-white fw-semibold">Генотипы</div>
          <div class="card-body py-2 border-bottom">
            <div class="row g-2">
              <div class="col-md-8">
                <input id="genotypes-search" type="search" class="form-control form-control-sm" placeholder="Поиск по гену или варианту..." />
              </div>
              <div class="col-md-4">
                <select id="genotypes-risk-filter" class="form-select form-select-sm">
                  <option value="">Все риски</option>
                  ${[...new Set(genotypes.map((g) => String(g.risk_type || "").trim()).filter(Boolean))]
                    .map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`)
                    .join("")}
                </select>
              </div>
            </div>
          </div>
          <div class="card-body p-0 doctor-table-scroll">
            <table class="table table-sm mb-0">
              <thead class="table-light">
                <tr><th>ID</th><th>Ген</th><th>Вариант</th><th>Риск</th><th>Дата добавления</th><th>Комментарий</th></tr>
              </thead>
              <tbody id="genotypes-tbody"></tbody>
            </table>
          </div>
        </div>

        <div class="card shadow-sm mb-3">
          <div class="card-header bg-white fw-semibold">Анализы витаминов</div>
          <div class="card-body py-2 border-bottom">
            <div class="row g-2">
              <div class="col-md-8">
                <input id="vitamins-search" type="search" class="form-control form-control-sm" placeholder="Поиск по витамину или значению..." />
              </div>
              <div class="col-md-4">
                <select id="vitamins-status-filter" class="form-select form-select-sm">
                  <option value="">Все статусы</option>
                  ${[...new Set(vitaminTests.map((t) => String(t.status || "").trim()).filter(Boolean))]
                    .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
                    .join("")}
                </select>
              </div>
            </div>
          </div>
          <div class="card-body p-0 doctor-table-scroll">
            <table class="table table-sm mb-0">
              <thead class="table-light">
                <tr><th>ID</th><th>Витамин</th><th>Значение</th><th>Статус</th><th>Дата добавления</th><th>Комментарий</th></tr>
              </thead>
              <tbody id="vitamins-tbody"></tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
    <div class="card shadow-sm mt-3">
      <div class="card-header bg-white fw-semibold">Комментарии врача</div>
      <div class="card-body">
        <div class="row g-2 mb-3">
          <div class="col-md-4">
            <label class="form-label small mb-1">Тип</label>
            <select id="comments-filter" class="form-select form-select-sm">
              <option value="all">Все</option>
              <option value="genotype">К генотипам</option>
              <option value="vitamin">К витаминам</option>
              <option value="general">Общие</option>
            </select>
          </div>
          <div class="col-md-8">
            <label class="form-label small mb-1">Поиск</label>
            <input id="comments-search" type="search" class="form-control form-control-sm" placeholder="Поиск по тексту комментария..." />
          </div>
        </div>
        <div id="comments-list"></div>
        <div id="comments-pagination" class="d-flex align-items-center justify-content-between mt-3"></div>
      </div>
    </div>

    <div id="comment-edit-modal" class="modal" tabindex="-1" style="display:none">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Редактирование комментария</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body">
            <form id="comment-edit-form">
              <input type="hidden" name="id" />
              <div class="mb-2">
                <label class="form-label small">Статус</label>
                <select name="status" class="form-select">
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликован</option>
                  <option value="deleted">Удалён</option>
                </select>
              </div>
              <div class="mb-2">
                <label class="form-label small">Текст</label>
                <textarea name="text" class="form-control" rows="4" required></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer"><button class="btn btn-primary" form="comment-edit-form" type="submit">Сохранить</button></div>
        </div>
      </div>
    </div>

    <div id="comment-view-modal" class="modal" tabindex="-1" style="display:none">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Комментарий</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body">
            <div id="comment-view-body" class="small" style="white-space:pre-wrap"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  pageEl.innerHTML = html;

  const commentForm = pageEl.querySelector("#comment-form");
  const bindZone = pageEl.querySelector("#comment-bind-zone");
  const scopeSelect = commentForm.querySelector('select[name="scope"]');
  const genotypeBlock = commentForm.querySelector("#scope-genotype");
  const vitaminBlock = commentForm.querySelector("#scope-vitamin");
  const publishToggle = pageEl.querySelector("#comment-publish-toggle");
  const commentsFilter = pageEl.querySelector("#comments-filter");
  const commentsSearch = pageEl.querySelector("#comments-search");
  const genotypesSearch = pageEl.querySelector("#genotypes-search");
  const genotypesRiskFilter = pageEl.querySelector("#genotypes-risk-filter");
  const vitaminsSearch = pageEl.querySelector("#vitamins-search");
  const vitaminsStatusFilter = pageEl.querySelector("#vitamins-status-filter");
  const editModalEl = pageEl.querySelector("#comment-edit-modal");
  const editModal = new bootstrap.Modal(editModalEl, {});
  const viewModalEl = pageEl.querySelector("#comment-view-modal");
  const viewModal = new bootstrap.Modal(viewModalEl, {});

  const syncScopeBlocks = () => {
    const scope = scopeSelect.value;
    genotypeBlock.classList.toggle("d-none", scope !== "genotype");
    vitaminBlock.classList.toggle("d-none", scope !== "vitamin_test");
  };
  syncScopeBlocks();
  scopeSelect.addEventListener("change", syncScopeBlocks);

  const openBindAndPreset = (scope, id) => {
    bindZone.classList.remove("d-none");
    scopeSelect.value = scope;
    syncScopeBlocks();
    if (scope === "genotype") commentForm.querySelector('select[name="genotype"]').value = String(id);
    if (scope === "vitamin_test") commentForm.querySelector('select[name="vitamin_test"]').value = String(id);
    document.getElementById("comment-form-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredComments = () => {
    const q = (state.query || "").trim().toLowerCase();
    return comments
      .filter((c) => {
        const t = commentType(c);
        if (state.filter !== "all" && t !== state.filter) return false;
        if (!q) return true;
        return String(c.text || "").toLowerCase().includes(q);
      })
      .sort((a, b) => dateKey(b.created_at) - dateKey(a.created_at));
  };

  const totalPages = () => Math.max(1, Math.ceil((state.total || 0) / state.pageSize));

  const filteredGenotypes = () => {
    const q = state.genotypeQuery.trim().toLowerCase();
    return genotypes.filter((g) => {
      if (state.genotypeRisk && String(g.risk_type || "") !== state.genotypeRisk) return false;
      if (!q) return true;
      return `${g.gene_symbol || ""} ${g.variant_genotype || ""}`.toLowerCase().includes(q);
    });
  };

  const filteredVitaminTests = () => {
    const q = state.vitaminQuery.trim().toLowerCase();
    return vitaminTests.filter((t) => {
      if (state.vitaminStatus && String(t.status || "") !== state.vitaminStatus) return false;
      if (!q) return true;
      return `${t.vitamin_name || ""} ${t.test_value || ""}`.toLowerCase().includes(q);
    });
  };

  const renderGenotypeTable = () => {
    const tbody = pageEl.querySelector("#genotypes-tbody");
    if (!tbody) return;
    const rows = filteredGenotypes();
    tbody.innerHTML = rows.length
      ? rows
          .map(
            (g) => `<tr ${dateKey(g.created_at || g.updated_at) > seenTs ? 'class="table-warning"' : ""}>
          <td class="text-muted">${g.id}</td>
          <td class="fw-semibold text-truncate" style="max-width:160px" title="${escapeHtml(g.gene_symbol || "")}">${escapeHtml(g.gene_symbol || "")}</td>
          <td class="text-truncate" style="max-width:170px" title="${escapeHtml(g.variant_genotype || "")}">${escapeHtml(g.variant_genotype || "")}</td>
          <td>${escapeHtml(g.risk_type || "")}</td>
          <td class="text-nowrap small text-muted">${escapeHtml(formatDateRu(g.created_at || g.updated_at))}</td>
          <td><button type="button" class="tiny-link-btn" data-action="genotype-comment" data-id="${g.id}">${renderCommentChip()}</button></td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="text-center text-muted py-3">Ничего не найдено</td></tr>';
  };

  const renderVitaminTable = () => {
    const tbody = pageEl.querySelector("#vitamins-tbody");
    if (!tbody) return;
    const rows = filteredVitaminTests();
    tbody.innerHTML = rows.length
      ? rows
          .map(
            (t) => `<tr ${dateKey(t.test_date || t.created_at || t.updated_at) > seenTs ? 'class="table-warning"' : ""}>
          <td class="text-muted">${t.id}</td>
          <td class="fw-semibold text-truncate" style="max-width:190px" title="${escapeHtml(t.vitamin_name || "")}">${escapeHtml(t.vitamin_name || "")}</td>
          <td>${escapeHtml(t.test_value)}</td>
          <td>${statusBadge(t.status)}</td>
          <td class="text-nowrap small text-muted">${escapeHtml(formatDateRu(t.test_date || t.created_at || t.updated_at))}</td>
          <td><button type="button" class="tiny-link-btn" data-action="vitamin-comment" data-id="${t.id}">${renderCommentChip()}</button></td>
        </tr>`,
          )
          .join("")
      : '<tr><td colspan="6" class="text-center text-muted py-3">Ничего не найдено</td></tr>';
  };

  const renderMarkerChips = () => {
    const byGen = new Map();
    const byVit = new Map();
    for (const c of comments) {
      if (c.genetic_result_id && !byGen.has(c.genetic_result_id)) byGen.set(c.genetic_result_id, c);
      if (c.vitamin_reading_id && !byVit.has(c.vitamin_reading_id)) byVit.set(c.vitamin_reading_id, c);
    }
    const gRows = pageEl.querySelectorAll("#genotypes-tbody [data-action='genotype-comment']");
    gRows.forEach((btn) => {
      const id = Number(btn.dataset.id);
      const c = byGen.get(id);
      btn.innerHTML = renderCommentChip();
      btn.dataset.commentId = c ? String(c.id) : "";
    });
    const vRows = pageEl.querySelectorAll("#vitamins-tbody [data-action='vitamin-comment']");
    vRows.forEach((btn) => {
      const id = Number(btn.dataset.id);
      const c = byVit.get(id);
      btn.innerHTML = renderCommentChip();
      btn.dataset.commentId = c ? String(c.id) : "";
    });
  };

  const renderComments = () => {
    const list = filteredComments();
    const listEl = pageEl.querySelector("#comments-list");
    if (!listEl) return;
    if (!list.length) {
      listEl.innerHTML = `<div class="text-muted small">Комментарии по выбранному фильтру не найдены.</div>`;
      return;
    }

    const blocks = ['<div class="comments-grid">'];
    let lastGroup = "";
    for (const c of list) {
      const group = groupLabel(c.created_at);
      if (group !== lastGroup) {
        blocks.push(`<div class="comments-group-title small text-uppercase text-muted fw-semibold mt-2 mb-1">${escapeHtml(group)}</div>`);
        lastGroup = group;
      }
      const meta = commentTypeMeta(c);
      const bindText = c.vitamin_reading_id
        ? `Анализ витамина #${c.vitamin_reading_id}`
        : c.genetic_result_id
          ? `Генотип #${c.genetic_result_id}`
          : "Пациент (общее)";
      blocks.push(`
        <div class="comment-row ${meta.cls} p-2 mb-2 border border-start">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="small">
              <div class="fw-semibold"><i class="bi ${meta.icon} me-1"></i>${escapeHtml(meta.title)} · #${c.id}</div>
              <div class="text-muted">${escapeHtml(bindText)} · ${escapeHtml(formatDateRu(c.created_at))}</div>
            </div>
            ${commentStatusBadge(c.status)}
          </div>
          <div class="mt-2 small" style="white-space: pre-wrap;">${escapeHtml(c.text)}</div>
          <div class="mt-2 d-flex gap-2 justify-content-end">
            <button class="btn btn-sm btn-outline-primary" data-action="edit-comment" data-id="${c.id}">Редактировать</button>
          </div>
        </div>
      `);
    }
    blocks.push("</div>");
    listEl.innerHTML = blocks.join("");
    renderMarkerChips();
  };

  const renderPagination = () => {
    const el = pageEl.querySelector("#comments-pagination");
    if (!el) return;
    if (state.loading) {
      el.innerHTML = `<div class="w-100 text-center py-2"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div></div>`;
      return;
    }
    const pages = totalPages();
    const prevDisabled = state.page <= 1 ? "disabled" : "";
    const nextDisabled = state.page >= pages ? "disabled" : "";
    el.innerHTML = `
      <button class="btn btn-sm btn-outline-secondary" id="comments-prev" ${prevDisabled}>&lt; Назад</button>
      <span class="small text-muted">Страница ${state.page} из ${pages}</span>
      <button class="btn btn-sm btn-outline-secondary" id="comments-next" ${nextDisabled}>Вперед &gt;</button>
    `;
    el.querySelector("#comments-prev")?.addEventListener("click", async () => {
      if (state.page <= 1) return;
      state.page -= 1;
      await reloadComments();
    });
    el.querySelector("#comments-next")?.addEventListener("click", async () => {
      if (state.page >= pages) return;
      state.page += 1;
      await reloadComments();
    });
  };

  const reloadComments = async () => {
    state.loading = true;
    renderPagination();
    try {
      const offset = (state.page - 1) * state.pageSize;
      const data = await api.comments.list({
        patient_id: patientId,
        limit: state.pageSize,
        offset,
      });
      if (Array.isArray(data)) {
        state.total = data.length;
        comments = data.slice(offset, offset + state.pageSize);
      } else {
        comments = Array.isArray(data?.results) ? data.results : [];
        state.total = Number(data?.count) || comments.length;
      }
    } catch {
      comments = [];
      state.total = 0;
    } finally {
      state.loading = false;
    }
    renderComments();
    renderPagination();
  };

  await reloadComments();
  renderGenotypeTable();
  renderVitaminTable();

  pageEl.querySelector("#btn-jump-comment")?.addEventListener("click", () => {
    document.getElementById("comment-form-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  pageEl.querySelector("#btn-expand-comment")?.addEventListener("click", () => bindZone.classList.toggle("d-none"));
  pageEl.querySelector("#btn-bind-comment")?.addEventListener("click", () => bindZone.classList.toggle("d-none"));

  commentsFilter.addEventListener("change", () => {
    state.filter = commentsFilter.value || "all";
    renderComments();
  });
  commentsSearch.addEventListener("input", () => {
    state.query = commentsSearch.value || "";
    renderComments();
  });
  genotypesSearch?.addEventListener("input", () => {
    state.genotypeQuery = genotypesSearch.value || "";
    renderGenotypeTable();
    renderMarkerChips();
  });
  genotypesRiskFilter?.addEventListener("change", () => {
    state.genotypeRisk = genotypesRiskFilter.value || "";
    renderGenotypeTable();
    renderMarkerChips();
  });
  vitaminsSearch?.addEventListener("input", () => {
    state.vitaminQuery = vitaminsSearch.value || "";
    renderVitaminTable();
    renderMarkerChips();
  });
  vitaminsStatusFilter?.addEventListener("change", () => {
    state.vitaminStatus = vitaminsStatusFilter.value || "";
    renderVitaminTable();
    renderMarkerChips();
  });

  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(commentForm);
      const payload = {
        text: form.get("text"),
        status: publishToggle.checked ? "published" : "draft",
      };
      const scope = bindZone.classList.contains("d-none") ? "patient" : form.get("scope");
      if (scope === "genotype") {
        const id = Number(form.get("genotype"));
        if (!Number.isFinite(id) || id <= 0) throw new Error("Выберите корректный генотип для привязки.");
        payload.genotype = id;
      } else if (scope === "vitamin_test") {
        const id = Number(form.get("vitamin_test"));
        if (!Number.isFinite(id) || id <= 0) throw new Error("Выберите корректный анализ витамина для привязки.");
        payload.vitamin_test = id;
      } else if (scope !== "patient") {
        throw new Error("Выберите корректный тип привязки комментария.");
      }

      await api.doctor.createComment(patientId, payload);
      commentForm.reset();
      publishToggle.checked = true;
      bindZone.classList.add("d-none");
      scopeSelect.value = "patient";
      syncScopeBlocks();
      await reloadComments();
      showAlert("success", "Комментарий сохранён");
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  const openEdit = (commentId) => {
    const c = comments.find((x) => Number(x.id) === Number(commentId));
    if (!c) return;
    const form = editModalEl.querySelector("#comment-edit-form");
    form.querySelector('input[name="id"]').value = String(c.id);
    form.querySelector('textarea[name="text"]').value = c.text || "";
    form.querySelector('select[name="status"]').value = c.status || "draft";
    editModal.show();
  };

  pageEl.addEventListener("click", (e) => {
    const editBtn = e.target.closest("button[data-action='edit-comment']");
    if (editBtn) {
      openEdit(editBtn.dataset.id);
      return;
    }

    const gc = e.target.closest("button[data-action='genotype-comment']");
    if (gc) {
      if (gc.dataset.commentId) {
        const c = comments.find((x) => Number(x.id) === Number(gc.dataset.commentId));
        pageEl.querySelector("#comment-view-body").innerHTML = c ? escapeHtml(c.text || "") : "Комментарий не найден";
        viewModal.show();
      } else {
        openBindAndPreset("genotype", gc.dataset.id);
      }
      return;
    }

    const vc = e.target.closest("button[data-action='vitamin-comment']");
    if (vc) {
      if (vc.dataset.commentId) {
        const c = comments.find((x) => Number(x.id) === Number(vc.dataset.commentId));
        pageEl.querySelector("#comment-view-body").innerHTML = c ? escapeHtml(c.text || "") : "Комментарий не найден";
        viewModal.show();
      } else {
        openBindAndPreset("vitamin_test", vc.dataset.id);
      }
    }
  });

  const editForm = editModalEl.querySelector("#comment-edit-form");
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(editForm);
      const commentId = Number(form.get("id"));
      const payload = {
        text: form.get("text"),
        status: form.get("status"),
      };
      await api.doctor.updateComment(commentId, payload);
      editModal.hide();
      await reloadComments();
      showAlert("success", "Комментарий обновлён");
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  writeSeenTs(seenKey, Date.now());
}

