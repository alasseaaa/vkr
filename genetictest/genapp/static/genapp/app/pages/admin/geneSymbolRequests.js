function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusRu(s) {
  const m = { pending: "ожидает", added: "добавлено", rejected: "отклонено" };
  return m[s] || s || "—";
}

function row(r) {
  return `
    <tr data-id="${r.id}">
      <td class="text-muted small">${r.id}</td>
      <td>
        <div class="fw-semibold">${escapeHtml(r.symbol || "")}</div>
        <div class="text-muted small">${r.raw_input && r.raw_input !== r.symbol ? `ввод: ${escapeHtml(r.raw_input)}` : ""}</div>
      </td>
      <td>
        <div>@${escapeHtml(r.user_username || "—")}</div>
        <div class="text-muted small text-break">${r.user_email ? escapeHtml(r.user_email) : "—"}</div>
      </td>
      <td class="small">${escapeHtml(r.proposed_genotype || "—")}</td>
      <td class="small" style="max-width: 220px;">${escapeHtml((r.comment && r.comment.trim()) || "—")}</td>
      <td>
        <span class="badge ${r.status === "pending" ? "text-bg-warning text-dark" : "text-bg-secondary"}">${escapeHtml(
          statusRu(r.status),
        )}</span>
      </td>
      <td class="text-muted small">${(r.created_at && String(r.created_at).length >= 10) ? String(r.created_at).slice(0, 10) : "—"}</td>
      <td class="text-end text-nowrap">
        ${
          r.status === "pending"
            ? `<button type="button" class="btn btn-sm btn-success me-1" data-a="done" data-id="${r.id}">В справочнике</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-a="rej" data-id="${r.id}">Отклонить</button>`
            : `<button type="button" class="btn btn-sm btn-outline-secondary" data-a="reopen" data-id="${r.id}">Снова в ожидание</button>`
        }
      </td>
    </tr>
  `;
}

export async function render(pageEl, { api, showAlert }) {
  pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка…</div></div>`;

  let statusFilter = "pending";
  const load = async () => {
    const params = statusFilter && statusFilter !== "all" ? { status: statusFilter } : {};
    const list = await api.admin.listGeneSymbolRequests(params);
    return Array.isArray(list) ? list : [];
  };

  let items = await load();
  if (!Array.isArray(items)) items = [];

  const body = (arr) => `
    <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
      <h3 class="mb-0">Заявки на новые гены</h3>
      <a class="btn btn-outline-primary btn-sm" href="#/admin/genes">К справочнику «Гены»</a>
    </div>
    <p class="text-muted small">Пациенты вводят символ, которого нет в базе. После того как вы создали <strong>Ген</strong> и <strong>варианты</strong>, нажмите «В справочнике» — пациент увидит это в личных заявках и сможет внести генотип в обычной форме.</p>
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <label class="small text-muted me-1">Статус:</label>
      <select id="greq-filter" class="form-select form-select-sm" style="max-width: 14rem">
        <option value="pending">Только ожидают</option>
        <option value="added">Добавлено</option>
        <option value="rejected">Отклонено</option>
        <option value="all">Все</option>
      </select>
    </div>
    <div class="table-responsive border rounded">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th>ID</th>
            <th>Ген</th>
            <th>Пациент</th>
            <th>Генотип (предл.)</th>
            <th>Комментарий</th>
            <th>Статус</th>
            <th>Дата</th>
            <th class="text-end">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${
            arr.length
              ? arr.map(row).join("")
              : '<tr><td colspan="8" class="text-center text-muted py-4">Нет заявок</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;

  const paint = (arr) => {
    pageEl.innerHTML = `<div class="app-page">${body(arr)}</div>`;
    const sel = pageEl.querySelector("#greq-filter");
    if (sel) {
      sel.value = statusFilter === "all" ? "all" : (statusFilter || "pending");
    }
  };

  paint(items);

  if (pageEl._geneReqTableClick) {
    pageEl.removeEventListener("click", pageEl._geneReqTableClick);
  }
  if (pageEl._geneReqFilterChange) {
    pageEl.removeEventListener("change", pageEl._geneReqFilterChange);
  }
  const onFilterChange = async (e) => {
    if (e.target?.id !== "greq-filter") return;
    statusFilter = String(e.target.value || "pending");
    pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка…</div></div>`;
    try {
      const next = await load();
      paint(Array.isArray(next) ? next : []);
    } catch (e) {
      showAlert("danger", e?.message || "Ошибка");
    }
  };
  pageEl._geneReqFilterChange = onFilterChange;
  pageEl.addEventListener("change", onFilterChange);
  const onTableClick = async (ev) => {
    const btn = ev.target?.closest?.("[data-a][data-id]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const a = btn.dataset.a;
    if (!id) return;
    if (a === "done") {
      try {
        await api.admin.patchGeneSymbolRequest(id, { status: "added" });
        showAlert("success", "Отмечено как «добавлено в справочник».");
        const next = await load();
        paint(next);
        try {
          const d = await api.admin.getGeneSymbolRequestPendingCount();
          const n = d?.pending_count ?? 0;
          const el = document.getElementById("admin-gene-req-badge");
          if (el) {
            el.textContent = n > 0 ? String(n) : "";
            el.style.display = n > 0 ? "inline-block" : "none";
          }
        } catch {
          /* */
        }
      } catch (e) {
        showAlert("danger", e?.message || "Ошибка");
      }
    } else if (a === "rej") {
      const reason = window.prompt("Причина отклонения (по желанию) — увидит пациент в примечании:") || "";
      try {
        await api.admin.patchGeneSymbolRequest(id, {
          status: "rejected",
          admin_note: reason,
        });
        showAlert("success", "Заявка отклонена.");
        const next = await load();
        paint(next);
        try {
          const d2 = await api.admin.getGeneSymbolRequestPendingCount();
          const n2 = d2?.pending_count ?? 0;
          const el2 = document.getElementById("admin-gene-req-badge");
          if (el2) {
            el2.textContent = n2 > 0 ? String(n2) : "";
            el2.style.display = n2 > 0 ? "inline-block" : "none";
          }
        } catch {
          /* */
        }
      } catch (e) {
        showAlert("danger", e?.message || "Ошибка");
      }
    } else if (a === "reopen") {
      try {
        await api.admin.patchGeneSymbolRequest(id, { status: "pending" });
        showAlert("success", "Статус сброшен на ожидает.");
        const next = await load();
        paint(next);
      } catch (e) {
        showAlert("danger", e?.message || "Ошибка");
      }
    }
  };
  pageEl._geneReqTableClick = onTableClick;
  pageEl.addEventListener("click", onTableClick);
}
