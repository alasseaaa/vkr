function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const CATS = [
  ["", "—"],
  ["metabolism", "Метаболизм"],
  ["sport", "Спорт"],
  ["vitamins", "Витамины"],
  ["nutrition", "Питание"],
  ["wellness", "Общее здоровье (без теста)"],
];

function catOptions(sel) {
  return CATS.map(
    ([v, l]) => `<option value="${escapeHtml(v)}" ${v === sel ? "selected" : ""}>${escapeHtml(l)}</option>`,
  ).join("");
}

function formFields(a) {
  const d = a || {};
  return `
  <form class="vstack gap-2" data-article-form>
    <div>
      <label class="form-label small">Заголовок</label>
      <input class="form-control" name="title" required value="${escapeHtml(d.title || "")}" />
    </div>
    <div>
      <label class="form-label small">Содержание</label>
      <textarea class="form-control" name="content" rows="10" required>${escapeHtml(d.content || "")}</textarea>
    </div>
    <div class="row g-2">
      <div class="col-md-4">
        <label class="form-label small">Категория</label>
        <select class="form-select" name="category">${catOptions(d.category || "")}</select>
      </div>
      <div class="col-md-4">
        <label class="form-label small">Автор (необяз.)</label>
        <input class="form-control" name="author" value="${escapeHtml(d.author || "")}" />
      </div>
      <div class="col-md-4">
        <label class="form-label small">ID гена (необяз., число)</label>
        <input class="form-control" name="gene" type="number" value="${d.gene != null && d.gene !== "" ? Number(d.gene) : ""}" placeholder="пусто" />
      </div>
    </div>
    <div>
      <label class="form-label small">Ссылка на источник</label>
      <input class="form-control" name="source_url" value="${escapeHtml(d.source_url || "")}" />
    </div>
  </form>`;
}

function row(art) {
  return `<tr>
    <td class="text-muted">${art.id}</td>
    <td class="small">${escapeHtml(art.title || "")}</td>
    <td class="text-muted small">${escapeHtml(art.gene_symbol || "—")}</td>
    <td class="text-nowrap text-end">
      <button class="btn btn-sm btn-outline-primary" data-e="1" data-id="${art.id}">Правка</button>
      <button class="btn btn-sm btn-outline-danger" data-d="1" data-id="${art.id}">Уд.</button>
    </td>
  </tr>`;
}

export async function render(pageEl, { api, showAlert }) {
  let list = [];
  try {
    list = (await api.admin.listCmsArticles()) || [];
  } catch (e) {
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e?.message || "Ошибка")}</div>`;
    return;
  }
  if (!Array.isArray(list)) list = [];

  pageEl.innerHTML = `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
      <h1 class="h3 mb-0">Статьи (админ)</h1>
      <a class="btn btn-outline-secondary btn-sm" href="#/articles">Как в приложении</a>
    </div>
    <div class="card shadow-sm mb-3">
      <div class="card-header bg-white">Новая статья</div>
      <div class="card-body" id="ac-new">${formFields()}</div>
      <div class="card-body pt-0"><button class="btn btn-primary" type="button" id="ac-create">Создать</button></div>
    </div>
    <div class="card shadow-sm">
      <div class="card-header bg-white">Список</div>
      <div class="table-responsive p-0">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light"><tr><th>ID</th><th>Назв.</th><th>Ген</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(row).join("") : "<tr><td colspan=4 class='text-center text-muted py-3'>Нет</td></tr>"}</tbody>
        </table>
      </div>
    </div>
    <div class="modal fade" id="amod" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header"><h5 class="modal-title" id="amodT">Правка</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body" id="amodB"></div>
        <div class="modal-footer"><button class="btn btn-primary" type="button" id="amodS">Сохранить</button></div>
      </div>
    </div></div>
  `;

  const getPayload = (form) => {
    const fd = new FormData(form);
    const g = (fd.get("gene") || "").toString().trim();
    return {
      title: (fd.get("title") || "").toString().trim(),
      content: (fd.get("content") || "").toString(),
      category: (fd.get("category") ?? "").toString().trim(),
      author: (fd.get("author") || "").toString().trim() || null,
      source_url: (fd.get("source_url") || "").toString().trim() || null,
      gene: g === "" ? null : Number(g) || null,
    };
  };

  pageEl.querySelector("#ac-create")?.addEventListener("click", async () => {
    const f = pageEl.querySelector("#ac-new form");
    try {
      await api.admin.createCmsArticle(getPayload(f));
      showAlert("success", "Создано");
      await render(pageEl, { api, showAlert });
    } catch (e) {
      showAlert("danger", e?.message);
    }
  });

  const modal = new bootstrap.Modal(pageEl.querySelector("#amod"));
  let editId = null;

  pageEl.addEventListener("click", async (e) => {
    const b = e.target;
    if (b.dataset.d && b.dataset.id) {
      if (!window.confirm("Удалить?")) return;
      try {
        await api.admin.deleteCmsArticle(Number(b.dataset.id));
        showAlert("success", "Удалено");
        await render(pageEl, { api, showAlert });
      } catch (e2) {
        showAlert("danger", e2?.message);
      }
    }
    if (b.dataset.e && b.dataset.id) {
      const a = list.find((x) => Number(x.id) === Number(b.dataset.id));
      if (!a) return;
      editId = Number(b.dataset.id);
      pageEl.querySelector("#amodB").innerHTML = formFields(a);
      pageEl.querySelector("#amodT").textContent = `Статья #${editId}`;
      modal.show();
    }
  });

  pageEl.querySelector("#amodS")?.addEventListener("click", async () => {
    const f = pageEl.querySelector("#amodB form");
    if (!f || !editId) return;
    try {
      await api.admin.updateCmsArticle(editId, getPayload(f));
      modal.hide();
      showAlert("success", "Сохранено");
      await render(pageEl, { api, showAlert });
    } catch (e) {
      showAlert("danger", e?.message);
    }
  });
}
