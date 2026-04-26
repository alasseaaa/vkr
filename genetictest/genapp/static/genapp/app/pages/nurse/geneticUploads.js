import { getAuth, isAuthed } from "../../services/auth.js?v=3";

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const ST = { pending: "В очереди", processing: "В работе", done: "Обработано", rejected: "Отклонено" };

function statusBadge(s) {
  const m = { pending: "warning", processing: "info", done: "success", rejected: "secondary" };
  const b = m[s] || "secondary";
  return `<span class="badge text-bg-${b}">${ST[s] || s || "—"}</span>`;
}

/**
 * @param {HTMLElement} pageEl
 * @param {{ api: any, showAlert: (t:string,m:string)=>void, route: object }} ctx
 */
export async function render(pageEl, { api, showAlert, route: _route }) {
  if (!isAuthed() || getAuth().role !== "nurse") {
    pageEl.innerHTML = `<div class="alert alert-warning">Нужен вход в учётную запись с ролью медсестры.</div>`;
    return;
  }

  try {
    const u = await api.nurse.getUnreadNurseUploadNotifications();
    const ids = (u?.items || []).map((x) => x.id).filter((x) => x != null);
    if (ids.length) {
      await api.nurse.markNurseNotificationsRead(ids);
    }
  } catch {
    /* */
  }

  let rows = [];
  let filter = "pending";
  const load = async () => {
    const params = filter ? { status: filter } : {};
    const d = await api.nurse.listGeneticReports(params);
    rows = Array.isArray(d) ? d : [];
  };

  const paint = () => {
    const body = rows.length
      ? rows
          .map((r) => {
            const pid = r.patient_id;
            const done = r.status === "done";
            const rejected = r.status === "rejected";
            const closed = done || rejected;
            return `<tr class="${closed ? "table-light" : ""}">
              <td class="text-muted">#${r.id}</td>
              <td>${esc(r.patient_username || "—")}</td>
              <td>${statusBadge(r.status)}${
                done
                  ? ` <span class="text-success small ms-1" title="Варианты внесены, заявка закрыта"><i class="bi bi-check2"></i></span>`
                  : ""
              }</td>
              <td>${(r.created_at && String(r.created_at).slice(0, 16)) || "—"}</td>
              <td>
                <a class="btn btn-sm btn-outline-secondary me-1" href="${esc(r.file_url)}" target="_blank" rel="noopener">PDF</a>
                ${
                  closed
                    ? done
                      ? `<a class="btn btn-sm btn-outline-primary" href="#/nurse/patient/${pid}/genotypes?upload=${r.id}">Карточка (готово)</a>`
                      : `—`
                    : `<a class="btn btn-sm btn-primary" href="#/nurse/patient/${pid}/genotypes?upload=${r.id}">Внести варианты</a>`
                }
              </td>
              <td>
                ${
                  closed
                    ? `<span class="text-muted small">${done && r.updated_at ? `закрыто ${esc(String(r.updated_at).slice(0, 16))}` : "—"}</span>`
                    : `<div class="btn-group btn-group-sm" role="group">
                  <button type="button" class="btn btn-outline-secondary" data-p="${r.id}" data-s="processing">В работе</button>
                  <button type="button" class="btn btn-outline-success" data-p="${r.id}" data-s="done">Готово</button>
                </div>`
                }
              </td>
            </tr>`;
          })
          .join("")
      : '<tr><td colspan="6" class="text-center text-muted py-4">Пока нет заявок</td></tr>';

    pageEl.innerHTML = `
      <div class="app-page">
        <a class="small d-inline-block mb-2" href="#/nurse/profile">← Рабочий стол: сводка по вводу вариантов</a>
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h1 class="app-page-title h3 mb-0">PDF из раздела «Гены»</h1>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <label class="text-muted small mb-0 me-1">Статус:</label>
            <select class="form-select form-select-sm" id="nurse-filter" style="width:auto;min-width:8rem">
              <option value="pending" ${filter === "pending" ? "selected" : ""}>В очереди</option>
              <option value="processing" ${filter === "processing" ? "selected" : ""}>В работе</option>
              <option value="done" ${filter === "done" ? "selected" : ""}>Готово</option>
              <option value="rejected" ${filter === "rejected" ? "selected" : ""}>Отклонено</option>
              <option value="" ${filter === "" ? "selected" : ""}>Все</option>
            </select>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="nurse-refresh">Обновить</button>
          </div>
        </div>
        <p class="text-secondary small">Пациенты прикрепляют PDF. Откройте документ, затем внесите варианты в профиль пациента. После обработки отметьте заявку «Готово».</p>
        <div class="table-responsive border rounded">
          <table class="table table-sm align-middle mb-0 table-hover">
            <thead class="table-light">
              <tr>
                <th>№</th>
                <th>Пациент</th>
                <th>Статус</th>
                <th>Создано</th>
                <th>Действия</th>
                <th>Смена статуса</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;

    const sel = pageEl.querySelector("#nurse-filter");
    if (sel) {
      sel.value = filter;
      sel.onchange = () => {
        filter = sel.value;
        (async () => {
          try {
            await load();
            paint();
          } catch (e) {
            showAlert("danger", e.message);
          }
        })();
      };
    }
    pageEl.querySelector("#nurse-refresh")?.addEventListener("click", () => {
      (async () => {
        try {
          await load();
          paint();
        } catch (e) {
          showAlert("danger", e.message);
        }
      })();
    });

    pageEl.querySelectorAll("button[data-s]").forEach((b) => {
      b.addEventListener("click", () => {
        (async () => {
          const id = Number(b.dataset.p);
          const s = b.dataset.s;
          try {
            await api.nurse.patchGeneticReport(id, { status: s });
            if (s === "done" && b.dataset.p) {
              /* optional: mark notification read for this upload is separate */
            }
            showAlert("success", "Статус обновлён");
            await load();
            paint();
          } catch (e) {
            showAlert("danger", e.message);
          }
        })();
      });
    });
  };

  try {
    await load();
  } catch (e) {
    showAlert("danger", e.message);
  }
  paint();
}
