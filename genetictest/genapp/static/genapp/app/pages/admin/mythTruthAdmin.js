function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function row(q) {
  return `
    <tr>
      <td class="text-muted">${q.id}</td>
      <td><div class="small" style="max-width: 280px;">${escapeHtml((q.statement || "").slice(0, 120))}${(q.statement || "").length > 120 ? "…" : ""}</div></td>
      <td class="text-nowrap">${q.correct_is_truth ? "Правда" : "Миф"}</td>
      <td class="text-nowrap small">${q.is_active ? "да" : "нет"}</td>
      <td class="text-end text-nowrap">
        <button type="button" class="btn btn-sm btn-outline-primary" data-a="edit" data-id="${q.id}">Правка</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-a="del" data-id="${q.id}">Удал.</button>
      </td>
    </tr>
  `;
}

export async function render(pageEl, { api, showAlert }) {
  const load = async () => (await api.admin.listMythTruthQuestions()) || [];

  let list = [];
  try {
    list = await load();
  } catch (e) {
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e?.message || "Ошибка")}</div>`;
    return;
  }
  if (!Array.isArray(list)) list = [];

  const formFields = (data) => `
    <form class="vstack gap-2" data-myth-form="1" action="javascript:void(0)">
      <div>
        <label class="form-label small">Утверждение</label>
        <textarea class="form-control" name="statement" rows="3" required>${escapeHtml(data.statement || "")}</textarea>
      </div>
      <div>
        <label class="form-check small">
          <input type="checkbox" class="form-check-input" name="correct_is_truth" ${data.correct_is_truth ? "checked" : ""} />
          Верный ответ — «Правда» (снято — «Миф»)
        </label>
      </div>
      <div>
        <label class="form-label small">Пояснение</label>
        <textarea class="form-control" name="explanation" rows="3" required>${escapeHtml(data.explanation || "")}</textarea>
      </div>
      <div>
        <label class="form-label small">URL источника (необяз.)</label>
        <input class="form-control" name="source_url" value="${escapeHtml(data.source_url || "")}" />
      </div>
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small">Порядок</label>
          <input type="number" class="form-control" name="sort_order" min="0" value="${Number(data.sort_order) || 0}" />
        </div>
        <div class="col-md-4 d-flex align-items-end">
          <label class="form-check small mb-0">
            <input type="checkbox" class="form-check-input" name="is_active" ${data.is_active !== false ? "checked" : ""} />
            Активен
          </label>
        </div>
      </div>
    </form>
  `;

  const body = () => `
    <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
      <h1 class="h3 mb-0">Тест «Миф или правда?» (админ)</h1>
      <a class="btn btn-outline-secondary btn-sm" href="#/admin/genes">К справочнику генов</a>
    </div>
    <div class="card shadow-sm mb-3">
      <div class="card-body">
        <h2 class="h6">Новый вопрос</h2>
        <div class="p-0" id="myth-create-wrap">${formFields({ sort_order: 0, is_active: true, correct_is_truth: true, statement: "", explanation: "", source_url: "" })}</div>
        <button type="button" class="btn btn-primary" id="btn-create">Добавить</button>
      </div>
    </div>
    <div class="card shadow-sm">
      <div class="card-header bg-white fw-semibold">Вопросы (${list.length})</div>
      <div class="table-responsive p-0">
        <table class="table table-hover table-sm align-middle mb-0">
          <thead class="table-light"><tr><th>ID</th><th>Текст</th><th>Ключ</th><th>Акт.</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(row).join("") : "<tr><td colspan=5 class='text-center text-muted py-3'>Пусто</td></tr>"}</tbody>
        </table>
      </div>
    </div>
    <div class="modal fade" id="mod" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title" id="modTitle">Правка</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body" id="modBody"></div>
          <div class="modal-footer">
            <button class="btn btn-primary" type="button" id="modSave">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  `;

  pageEl.innerHTML = body();

  const collect = (form) => {
    const fd = new FormData(form);
    return {
      statement: (fd.get("statement") || "").toString().trim(),
      correct_is_truth: form.querySelector('input[name="correct_is_truth"]')?.checked === true,
      explanation: (fd.get("explanation") || "").toString().trim(),
      source_url: (fd.get("source_url") || "").toString().trim() || "",
      sort_order: Number(fd.get("sort_order")) || 0,
      is_active: form.querySelector('input[name="is_active"]')?.checked === true,
    };
  };

  const createF = pageEl.querySelector("#myth-create-wrap form");
  pageEl.querySelector("#btn-create")?.addEventListener("click", async () => {
    try {
      if (!createF) return;
      const payload = collect(createF);
      await api.admin.createMythTruthQuestion(payload);
      showAlert("success", "Создано");
      await render(pageEl, { api, showAlert });
    } catch (e) {
      showAlert("danger", e?.message || "Ошибка");
    }
  });

  const modal = new bootstrap.Modal(pageEl.querySelector("#mod"));
  let editId = null;
  const modBody = pageEl.querySelector("#modBody");

  pageEl.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-a]");
    if (!b) return;
    const id = Number(b.dataset.id);
    if (b.dataset.a === "del") {
      if (!window.confirm("Удалить вопрос?")) return;
      try {
        await api.admin.deleteMythTruthQuestion(id);
        showAlert("success", "Удалено");
        await render(pageEl, { api, showAlert });
      } catch (e2) {
        showAlert("danger", e2?.message);
      }
      return;
    }
    if (b.dataset.a === "edit") {
      const q = list.find((x) => Number(x.id) === id);
      if (!q) return;
      editId = id;
      modBody.innerHTML = formFields(q);
      pageEl.querySelector("#modTitle").textContent = `Правка #${id}`;
      modal.show();
    }
  });

  pageEl.querySelector("#modSave")?.addEventListener("click", async () => {
    if (!editId) return;
    const f = modBody.querySelector("form[data-myth-form]");
    if (!f) return;
    try {
      const payload = collect(f);
      await api.admin.updateMythTruthQuestion(editId, payload);
      modal.hide();
      showAlert("success", "Сохранено");
      await render(pageEl, { api, showAlert });
    } catch (e) {
      showAlert("danger", e?.message);
    }
  });
}
