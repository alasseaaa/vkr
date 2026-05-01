function statusBadge(status) {
  if (status === "Дефицит") return `<span class="badge bg-danger badge-status">${status}</span>`;
  if (status === "Норма") return `<span class="badge bg-success badge-status">${status}</span>`;
  if (status === "Профицит") return `<span class="badge bg-warning text-dark badge-status">${status}</span>`;
  return `<span class="badge bg-secondary badge-status">${status || "—"}</span>`;
}

function commentStatusBadge(status) {
  if (status === "published") return `<span class="badge bg-success">${status}</span>`;
  if (status === "draft") return `<span class="badge bg-secondary">${status}</span>`;
  if (status === "deleted") return `<span class="badge bg-danger">${status}</span>`;
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

export async function render(pageEl, { api, route, showAlert }) {
  const patientId = route.patientId;
  pageEl.innerHTML = `<div class="card"><div class="card-body">Загрузка профиля пациента #${patientId}...</div></div>`;

  let profile;
  try {
    profile = await api.doctor.getProfile(patientId);
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    return;
  }

  const genotypes = profile?.genotypes || [];
  const vitaminTests = profile?.vitamin_tests || [];

  let comments = [];

  const reloadComments = async () => {
    try {
      const data = await api.comments.list({ patient_id: patientId });
      comments = Array.isArray(data) ? data : [];
    } catch {
      comments = [];
    }
    renderComments();
  };

  const renderComments = () => {
    const listEl = pageEl.querySelector("#comments-list");
    if (!listEl) return;
    listEl.innerHTML =
      comments.length === 0
        ? `<div class="text-muted small">Пока нет комментариев.</div>`
        : comments
            .map(
              (c) => `
            <div class="p-2 border rounded-2 mb-2">
              <div class="d-flex align-items-start justify-content-between gap-2">
                <div>
                  <div class="fw-semibold">#${c.id}</div>
                  <div class="text-muted small">
                    ${
                      c.vitamin_reading_id
                        ? `Связь: анализ витамина #${c.vitamin_reading_id}`
                        : c.genetic_result_id
                          ? `Связь: генотип #${c.genetic_result_id}`
                          : `Связь: пациент (общее)`
                    }
                  </div>
                </div>
                ${commentStatusBadge(c.status)}
              </div>
              <div class="mt-2" style="white-space: pre-wrap;">${escapeHtml(c.text)}</div>
              <div class="mt-2 d-flex gap-2 justify-content-end">
                <button class="btn btn-sm btn-outline-primary" data-action="edit-comment" data-id="${c.id}">
                  Редактировать
                </button>
              </div>
            </div>
          `,
            )
            .join("");
  };

  const patient = profile?.patient;
  const patientProfile = patient?.profile;

  pageEl.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <div>
        <h3 class="mb-0">Профиль пациента</h3>
        <div class="text-muted small">@${patient?.username || ""}</div>
      </div>
      <a class="btn btn-outline-secondary btn-sm" href="#/doctor/patients">Назад к списку</a>
    </div>

    <div class="row g-3">
      <div class="col-lg-5">
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-white fw-semibold">Данные пациента</div>
          <div class="card-body">
            <div class="mb-2"><span class="text-muted small">ФИО:</span> <span class="fw-semibold">${escapeHtml(
              patient?.full_name || `${patient?.first_name || ""} ${patient?.last_name || ""}`.trim(),
            )}</span></div>
            <div class="mb-2"><span class="text-muted small">Рост:</span> ${escapeHtml(patientProfile?.height ?? "—")} см</div>
            <div class="mb-2"><span class="text-muted small">Вес:</span> ${escapeHtml(patientProfile?.weight ?? "—")} кг</div>
            <div class="mb-2"><span class="text-muted small">Пол:</span> ${escapeHtml(patientProfile?.gender ?? "—")}</div>
            <div class="mb-2"><span class="text-muted small">Активность:</span> ${escapeHtml(patientProfile?.activity_level ?? "—")}</div>
          </div>
        </div>

        <div class="card shadow-sm">
          <div class="card-header bg-white fw-semibold">Добавить комментарий врача</div>
          <div class="card-body">
            <form id="comment-form">
              <div class="mb-2">
                <label class="form-label small">Кому/к чему относится комментарий</label>
                <select name="scope" class="form-select" required>
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
                  ${vitaminTests.length ? vitaminTests.map((t) => `<option value="${t.id}">${escapeHtml(t.vitamin_name || "")} (${t.test_value})</option>`).join("") : `<option value="">Нет данных</option>`}
                </select>
              </div>

              <div class="mb-2">
                <label class="form-label small">Статус</label>
                <select name="status" class="form-select">
                  <option value="draft" selected>Черновик</option>
                  <option value="published">Опубликован</option>
                  <option value="deleted">Удален</option>
                </select>
              </div>

              <div class="mb-2">
                <label class="form-label small">Текст</label>
                <textarea name="text" class="form-control" rows="4" required placeholder="Комментарий врача..."></textarea>
              </div>

              <button class="btn btn-primary w-100" type="submit">
                <i class="bi bi-chat-left-text me-1"></i>Сохранить
              </button>
            </form>
          </div>
        </div>

        <div class="card shadow-sm mt-3">
          <div class="card-header bg-white fw-semibold">Формирование заключения</div>
          <div class="card-body">
            <form id="conclusion-form">
              <div class="mb-2">
                <label class="form-label small">Текст заключения</label>
                <textarea name="text" class="form-control" rows="4" required></textarea>
              </div>
              <button class="btn btn-success w-100" type="submit">
                <i class="bi bi-file-text me-1"></i>Опубликовать
              </button>
            </form>
          </div>
        </div>
      </div>

      <div class="col-lg-7">
        <div class="card shadow-sm mb-3">
          <div class="card-header bg-white fw-semibold">Генотипы</div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead class="table-light">
                <tr>
                  <th>ID</th>
                  <th>Ген</th>
                  <th>Вариант</th>
                  <th>Риск</th>
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
                      <td class="fw-semibold">${escapeHtml(g.gene_symbol || "")}</td>
                      <td>${escapeHtml(g.variant_genotype || "")}</td>
                      <td>${escapeHtml(g.risk_type || "")}</td>
                    </tr>
                  `,
                        )
                        .join("")
                    : `<tr><td colspan="4" class="text-center text-muted py-3">Нет генотипов</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card shadow-sm mb-3">
          <div class="card-header bg-white fw-semibold">Анализы витаминов</div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead class="table-light">
                <tr>
                  <th>ID</th>
                  <th>Витамин</th>
                  <th>Значение</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                ${
                  vitaminTests.length
                    ? vitaminTests
                        .map(
                          (t) => `
                    <tr>
                      <td class="text-muted">${t.id}</td>
                      <td class="fw-semibold">${escapeHtml(t.vitamin_name || "")}</td>
                      <td>${t.test_value}</td>
                      <td>${statusBadge(t.status)}</td>
                    </tr>
                  `,
                        )
                        .join("")
                    : `<tr><td colspan="4" class="text-center text-muted py-3">Нет анализов</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card shadow-sm">
          <div class="card-header bg-white fw-semibold">Комментарии врача</div>
          <div class="card-body" id="comments-list"></div>
        </div>
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
                  <option value="deleted">Удален</option>
                </select>
              </div>
              <div class="mb-2">
                <label class="form-label small">Текст</label>
                <textarea name="text" class="form-control" rows="4" required></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" form="comment-edit-form" type="submit">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await reloadComments();

  const scopeSelect = pageEl.querySelector('select[name="scope"]');
  const genotypeBlock = pageEl.querySelector("#scope-genotype");
  const vitaminBlock = pageEl.querySelector("#scope-vitamin");

  const syncScopeBlocks = () => {
    const scope = scopeSelect.value;
    genotypeBlock.classList.toggle("d-none", scope !== "genotype");
    vitaminBlock.classList.toggle("d-none", scope !== "vitamin_test");
  };
  scopeSelect.addEventListener("change", syncScopeBlocks);
  syncScopeBlocks();

  const commentForm = pageEl.querySelector("#comment-form");
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(commentForm);
      const scope = form.get("scope");
      const status = form.get("status");
      const text = form.get("text");

      const payload = { text, status };
      if (scope === "genotype") {
        payload.genotype = Number(form.get("genotype"));
      } else if (scope === "vitamin_test") {
        payload.vitamin_test = Number(form.get("vitamin_test"));
      }

      await api.doctor.createComment(patientId, payload);
      await reloadComments();
      showAlert("success", "Комментарий сохранён");
      commentForm.reset();
      syncScopeBlocks();
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  const conclusionForm = pageEl.querySelector("#conclusion-form");
  conclusionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const form = new FormData(conclusionForm);
      const text = form.get("text");
      await api.doctor.createConclusion(patientId, { text });
      await reloadComments();
      showAlert("success", "Заключение опубликовано");
      conclusionForm.reset();
    } catch (err) {
      showAlert("danger", err.message);
    }
  });

  const editModalEl = pageEl.querySelector("#comment-edit-modal");
  const editModal = new bootstrap.Modal(editModalEl, {});

  const openEdit = (commentId) => {
    const c = comments.find((x) => Number(x.id) === Number(commentId));
    if (!c) return;
    const form = editModalEl.querySelector("#comment-edit-form");
    form.querySelector('input[name="id"]').value = String(c.id);
    form.querySelector('textarea[name="text"]').value = c.text || "";
    form.querySelector('select[name="status"]').value = c.status || "draft";
    editModal.show();
  };

  pageEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='edit-comment']");
    if (!btn) return;
    openEdit(btn.dataset.id);
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
}

