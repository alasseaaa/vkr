function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function minLocalDatetimeInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const STATUS_LABELS = {
  pending: "Ожидает ответа врача",
  confirmed: "Подтверждено",
  declined: "Отклонено",
  cancelled_by_patient: "Отменено вами",
  cancelled_by_doctor: "Отменено врачом",
};

function statusBadgeClass(st) {
  if (st === "confirmed") return "text-bg-success";
  if (st === "pending") return "text-bg-warning text-dark";
  if (st === "declined" || st === "cancelled_by_doctor" || st === "cancelled_by_patient") return "text-bg-secondary";
  return "text-bg-light text-dark";
}

export async function render(pageEl, { api, showAlert }) {
  pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка…</div></div>`;

  let doctors = [];
  let items = [];
  try {
    [doctors, items] = await Promise.all([api.patient.listLinkedDoctors(), api.patient.listAppointments()]);
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    return;
  }

  doctors = Array.isArray(doctors) ? doctors : [];
  items = Array.isArray(items) ? items : [];
  const assignedDoctor = doctors[0] || null;
  const assignedDoctorLabel = assignedDoctor
    ? (assignedDoctor.full_name || `${assignedDoctor.first_name || ""} ${assignedDoctor.last_name || ""}`.trim() || assignedDoctor.username || "").trim()
    : "";

  const listHtml = items.length
    ? items
        .map((a) => {
          const canCancel = a.status === "pending" || a.status === "confirmed";
          return `
        <div class="card app-card shadow-sm mb-3" data-appt-id="${a.id}">
          <div class="card-body">
            <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
              <span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(STATUS_LABELS[a.status] || a.status)}</span>
              <span class="text-muted small">врач: ${escapeHtml(a.doctor_name || "")}</span>
            </div>
            <div class="small"><strong>Желаемое время:</strong> ${escapeHtml(formatDt(a.requested_start))}</div>
            ${
              a.status === "confirmed" && a.confirmed_start
                ? `<div class="small"><strong>Подтверждено на:</strong> ${escapeHtml(formatDt(a.confirmed_start))}</div>`
                : ""
            }
            ${a.patient_note ? `<div class="small mt-2"><strong>Ваш комментарий:</strong> ${escapeHtml(a.patient_note)}</div>` : ""}
            ${a.doctor_message ? `<div class="small mt-2 p-2 rounded bg-light"><strong>Врач:</strong> ${escapeHtml(a.doctor_message)}</div>` : ""}
            ${
              canCancel
                ? `<button type="button" class="btn btn-sm btn-outline-danger mt-2" data-cancel-appt="${a.id}">Отменить заявку</button>`
                : ""
            }
          </div>
        </div>`;
        })
        .join("")
    : `<p class="text-muted">У вас пока нет заявок.</p>`;

  pageEl.innerHTML = `
    <div class="app-page">
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h3 class="mb-0">Запись на очный приём</h3>
        <a class="btn btn-outline-secondary btn-sm" href="#/dashboard">На дашборд</a>
      </div>
      <p class="text-muted small mb-4">
        Оставьте заявку с удобным временем. Врач подтвердит, предложит другое время или отклонит запись.
      </p>

      ${
        doctors.length === 0
          ? `<div class="alert alert-warning">У вас нет закреплённого врача. Запись через сайт недоступна — обратитесь в клинику.</div>`
          : `
      <div class="card app-card shadow-sm mb-4">
        <div class="card-body">
          <h5 class="card-title">Новая заявка</h5>
          <form id="form-new-appt" class="row g-3">
            <div class="col-12">
              <label class="form-label">Лечащий врач</label>
              <input class="form-control" value="${escapeHtml(assignedDoctorLabel)}" disabled />
              ${
                doctors.length > 1
                  ? `<div class="form-text">Назначено несколько врачей. Заявка создается на основного закрепленного врача.</div>`
                  : ""
              }
            </div>
            <div class="col-md-6">
              <label class="form-label">Желаемые дата и время</label>
              <input class="form-control" type="datetime-local" name="requested_start" required min="${minLocalDatetimeInput()}" />
            </div>
            <div class="col-12">
              <label class="form-label">Комментарий (необязательно)</label>
              <textarea class="form-control" name="patient_note" rows="2" placeholder="Например: первичная консультация по результатам"></textarea>
            </div>
            <div class="col-12">
              <button type="submit" class="btn btn-primary">Отправить заявку</button>
            </div>
          </form>
        </div>
      </div>`
      }

      <h5 class="mb-3">Мои заявки</h5>
      ${listHtml}
    </div>
  `;

  const form = pageEl.querySelector("#form-new-appt");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const localDt = fd.get("requested_start");
      const patient_note = (fd.get("patient_note") || "").trim();
      if (!localDt) return;
      const requested_start = new Date(localDt).toISOString();
      try {
        await api.patient.createAppointment({ requested_start, patient_note });
        showAlert("success", "Заявка отправлена.");
        await render(pageEl, { api, showAlert });
      } catch (err) {
        showAlert("danger", err.message);
      }
    });
  }

  pageEl.querySelectorAll("[data-cancel-appt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-cancel-appt"));
      if (!Number.isFinite(id)) return;
      if (!window.confirm("Отменить эту заявку?")) return;
      try {
        await api.patient.cancelAppointment(id);
        showAlert("success", "Заявка отменена.");
        await render(pageEl, { api, showAlert });
      } catch (err) {
        showAlert("danger", err.message);
      }
    });
  });
}
