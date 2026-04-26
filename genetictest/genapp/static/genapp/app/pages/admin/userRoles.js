function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function labelRole(r) {
  if (r === "nurse") return "Медсестра";
  if (r === "doctor") return "Врач";
  return "— (пациент / нет клин. роли)";
}

function userRow(u) {
  const cr = u.clinical_role || "";
  return `<tr>
    <td class="text-muted">#${u.id}</td>
    <td class="text-nowrap small">@${escapeHtml(u.username || "")}</td>
    <td class="small">${escapeHtml((u.last_name || "") + " " + (u.first_name || "")).trim() || "—"}</td>
    <td class="small text-muted">${escapeHtml(u.email || "")}</td>
    <td class="small">${u.is_superuser ? "super" : u.is_staff ? "staff" : "—"}</td>
    <td class="small">${labelRole(cr)}</td>
    <td class="text-nowrap" style="min-width: 220px">
      <select class="form-select form-select-sm d-inline w-auto" data-user="${u.id}" data-sel>
        <option value="none" ${!cr ? "selected" : ""}>Нет (снять)</option>
        <option value="nurse" ${cr === "nurse" ? "selected" : ""}>Медсестра</option>
        <option value="doctor" ${cr === "doctor" ? "selected" : ""}>Врач</option>
      </select>
      <button class="btn btn-sm btn-primary ms-1" data-apply="${u.id}" type="button">OK</button>
    </td>
  </tr>`;
}

export async function render(pageEl, { api, showAlert }) {
  let q = "";
  let list = [];
  const load = async () => {
    const res = (await api.admin.listUsers({ q, limit: 100 })) || { results: [] };
    return Array.isArray(res.results) ? res.results : [];
  };
  try {
    list = await load();
  } catch (e) {
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e?.message || "Ошибка")}</div>`;
    return;
  }

  const paint = () => {
    pageEl.querySelector("#ur-tbody").innerHTML = list.length
      ? list.map(userRow).join("")
      : "<tr><td colspan=7 class='text-center text-muted py-3'>Нет пользователей</td></tr>";
  };

  pageEl.innerHTML = `
    <h1 class="h3 mb-2">Врач и медсестра (группы Django)</h1>
    <p class="text-secondary small">Назначается группа <code>doctor</code> или <code>nurse</code>. «Нет» снимает обе. Суперпользователей и себя нельзя менять.</p>
    <div class="row g-2 mb-2">
      <div class="col-md-6">
        <input class="form-control" id="ur-q" placeholder="Поиск: логин, email, имя…" value="${escapeHtml(q)}" />
      </div>
      <div class="col-auto">
        <button class="btn btn-outline-primary" type="button" id="ur-search">Найти</button>
      </div>
    </div>
    <div class="table-responsive border rounded">
      <table class="table table-sm table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th>ID</th><th>Логин</th><th>Имя</th><th>Email</th><th>Флаги</th><th>Роль</th><th>Назначить</th>
          </tr>
        </thead>
        <tbody id="ur-tbody"></tbody>
      </table>
    </div>
  `;
  paint();

  const search = async () => {
    q = (pageEl.querySelector("#ur-q")?.value || "").trim();
    try {
      list = await load();
    } catch (e) {
      showAlert("danger", e?.message);
      return;
    }
    paint();
  };
  pageEl.querySelector("#ur-search")?.addEventListener("click", search);
  pageEl.querySelector("#ur-q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search();
  });

  pageEl.addEventListener("click", async (e) => {
    const b = e.target;
    if (!b.dataset || !b.dataset.apply) return;
    const uid = Number(b.dataset.apply);
    const tr = b.closest("tr");
    const sel = tr && tr.querySelector("select[data-sel]");
    if (!sel) return;
    const role = (sel.value || "none").toLowerCase();
    try {
      const u = await api.admin.setUserClinicalRole(uid, role);
      showAlert("success", "Сохранено");
      const i = list.findIndex((x) => Number(x.id) === Number(u.id));
      if (i >= 0) list[i] = u;
      else list.push(u);
      paint();
    } catch (e2) {
      showAlert("danger", e2?.message);
    }
  });
}
