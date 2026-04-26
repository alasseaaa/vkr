import { getAuth, getEffectiveRole, isAuthed } from "../../services/auth.js?v=8";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const ST = { pending: "В очереди", processing: "В работе", done: "Обработано", rejected: "Отклонено" };

/**
 * @param {HTMLElement} pageEl
 * @param {{ api: any, showAlert: (t:string,m:string)=>void }} ctx
 */
export async function render(pageEl, { api, showAlert }) {
  if (!isAuthed() || getEffectiveRole() !== "nurse") {
    pageEl.innerHTML = `<div class="alert alert-warning">Доступ только для роли «медсестра».</div>`;
    return;
  }
  const a = getAuth();
  const u = String(a.username || "—")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  let me = null;
  try {
    me = await api.auth.me();
  } catch {
    /* */
  }
  const fullName = `${String(me?.first_name || "").trim()} ${String(me?.last_name || "").trim()}`.trim() || "—";

  try {
    const n = await api.nurse.getUnreadNurseUploadNotifications();
    const ids = (n?.items || []).map((x) => x.id).filter((x) => x != null);
    if (ids.length) {
      await api.nurse.markNurseNotificationsRead(ids);
    }
  } catch {
    /* */
  }

  let rows = [];
  try {
    const [a1, a2] = await Promise.all([
      api.nurse.listGeneticReports({ status: "pending" }),
      api.nurse.listGeneticReports({ status: "processing" }),
    ]);
    const m = new Map();
    for (const r of [...(Array.isArray(a1) ? a1 : []), ...(Array.isArray(a2) ? a2 : [])]) {
      if (r && r.id != null) m.set(r.id, r);
    }
    rows = Array.from(m.values());
    rows.sort((x, y) => String(y.created_at || "").localeCompare(String(x.created_at || "")));
  } catch (e) {
    showAlert("danger", e?.message || "Не удалось загрузить заявки");
  }

  let doneRows = [];
  try {
    const d = await api.nurse.listGeneticReports({ status: "done" });
    if (Array.isArray(d) && d.length) {
      doneRows = d.slice(0, 8);
    }
  } catch {
    /* */
  }

  const tableBody = rows.length
    ? rows
        .map((r) => {
          const pid = r.patient_id;
          return `<tr>
        <td class="text-muted">#${r.id}</td>
        <td>${esc(r.patient_username || "—")}</td>
        <td>${ST[r.status] || r.status || "—"}</td>
        <td>${(r.created_at && String(r.created_at).slice(0, 16)) || "—"}</td>
        <td class="text-nowrap">
          <a class="btn btn-sm btn-outline-secondary me-1" href="${esc(r.file_url)}" target="_blank" rel="noopener">PDF</a>
          <a class="btn btn-sm btn-primary" href="#/nurse/patient/${Number(pid)}/genotypes?upload=${r.id}">Внести варианты</a>
        </td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="text-center text-muted py-3">Сейчас нет заявок в работе (очередь и в работе пусты).</td></tr>`;

  const doneTableBody = doneRows.length
    ? doneRows
        .map((r) => {
          const um = (r.updated_at && String(r.updated_at).slice(0, 16)) || "—";
          return `<tr>
        <td class="text-muted">#${r.id}</td>
        <td>${esc(r.patient_username || "—")}</td>
        <td>
          <span class="text-success small"><i class="bi bi-check2-circle me-1"></i>Варианты в карточке</span>
          <div class="text-muted small">Закрыто: ${esc(um)}${
            r.processed_by_username
              ? ` · ${esc(r.processed_by_username)}`
              : ""
          }</div>
        </td>
        <td>
          <a class="btn btn-sm btn-outline-secondary" href="#/nurse/patient/${Number(
            r.patient_id,
          )}/genotypes?upload=${r.id}">Открыть</a>
        </td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="text-center text-muted py-2">Пока нет завершённых заявок</td></tr>`;

  pageEl.innerHTML = `
    <div class="app-page">
      <h1 class="h3 app-page-title mb-3">Профиль (медсестра)</h1>

      <div class="card app-card shadow-sm border-primary border-opacity-25 mb-3" id="nurse-desk-pdf">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h2 class="h5 mb-0">Пациенты, загрузили PDF — внесите варианты в профиль</h2>
            <a class="btn btn-sm btn-outline-primary" href="#/nurse/genetic-uploads">Полный список, фильтры, статусы</a>
          </div>
          <p class="text-secondary small mb-2">Сначала откройте PDF, затем внесите геноварианты. Заявки в статусе «В очереди» и «В работе».</p>
          <div class="table-responsive border rounded">
            <table class="table table-sm align-middle mb-0 table-hover small">
              <thead class="table-light">
                <tr>
                  <th>№</th>
                  <th>Пациент</th>
                  <th>Статус</th>
                  <th>Создано</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>${tableBody}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card app-card shadow-sm mb-3">
        <div class="card-body">
          <h2 class="h5 mb-2">Недавно завершено</h2>
          <p class="text-secondary small mb-2">Варианты внесены, заявка закрыта (до 8 последних).</p>
          <div class="table-responsive border rounded">
            <table class="table table-sm align-middle mb-0 table-hover small">
              <thead class="table-light">
                <tr>
                  <th>№</th>
                  <th>Пациент</th>
                  <th>Результат</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${doneTableBody}</tbody>
            </table>
          </div>
          <a class="btn btn-sm btn-link px-0 mt-1" href="#/nurse/genetic-uploads">Все заявки и фильтры →</a>
        </div>
      </div>

      <div class="card app-card shadow-sm" style="max-width: 36rem">
        <div class="card-body">
          <h2 class="h6 text-muted">Учётная запись</h2>
          <p class="mb-1"><strong>Имя, фамилия</strong> <span class="text-body">${esc(fullName)}</span></p>
          <p class="text-muted small mb-0"><strong>Логин</strong> @${u}</p>
        </div>
      </div>
    </div>`;
}
