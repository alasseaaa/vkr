import { getEffectiveRole, isAuthed } from "../../services/auth.js?v=8";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validatePayload(payload) {
  const errors = {};
  const nameRe = /^[A-Za-zА-Яа-яЁё\-\s]{2,}$/;
  const first = String(payload.first_name || "").trim();
  const last = String(payload.last_name || "").trim();
  const pat = String(payload.patronymic || "").trim();
  if (first && !nameRe.test(first)) {
    errors.first_name = "Имя: только буквы, пробел и дефис (минимум 2 символа).";
  }
  if (last && !nameRe.test(last)) {
    errors.last_name = "Фамилия: только буквы, пробел и дефис (минимум 2 символа).";
  }
  if (pat && !nameRe.test(pat)) {
    errors.patronymic = "Отчество: только буквы, пробел и дефис (минимум 2 символа).";
  }
  return errors;
}

function clearFieldErrors(form) {
  form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
}

function showFieldErrors(form, errors) {
  Object.entries(errors).forEach(([name, msg]) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.classList.add("is-invalid");
    const err = form.querySelector(`.field-error[data-field="${name}"]`);
    if (err) err.textContent = msg;
  });
}

/**
 * @param {HTMLElement} pageEl
 * @param {{ api: any, showAlert: (t:string,m:string)=>void }} ctx
 */
export async function render(pageEl, { api, showAlert }) {
  if (!isAuthed() || getEffectiveRole() !== "doctor") {
    pageEl.innerHTML = `<div class="alert alert-warning">Раздел доступен только врачу.</div>`;
    return;
  }

  pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка профиля…</div></div>`;

  let data;
  try {
    data = await api.doctor.getMyProfile();
  } catch (e) {
    showAlert("danger", e.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
    return;
  }

  pageEl.innerHTML = `
    <div class="app-page">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h1 class="app-page-title h3 mb-0">Профиль врача</h1>
        <a class="btn btn-outline-secondary btn-sm" href="#/doctor/patients">К пациентам</a>
      </div>
      <p class="text-muted small mb-3">Укажите фамилию, имя и отчество — они отображаются пациентам в комментариях и уведомлениях.</p>
      <div class="card app-card shadow-sm">
        <div class="card-body">
          <form id="doctor-profile-form" class="row g-3">
            <div class="col-md-6">
              <label class="form-label small">Логин</label>
              <input class="form-control" value="${escapeHtml(data.username || "")}" disabled />
            </div>
            <div class="col-md-6">
              <label class="form-label small">Email</label>
              <input class="form-control" value="${escapeHtml(data.email || "")}" disabled />
            </div>
            <div class="col-md-4">
              <label class="form-label small">Фамилия</label>
              <input name="last_name" class="form-control" value="${escapeHtml(data.last_name || "")}" />
              <div class="text-danger small field-error mt-1" data-field="last_name"></div>
            </div>
            <div class="col-md-4">
              <label class="form-label small">Имя</label>
              <input name="first_name" class="form-control" value="${escapeHtml(data.first_name || "")}" />
              <div class="text-danger small field-error mt-1" data-field="first_name"></div>
            </div>
            <div class="col-md-4">
              <label class="form-label small">Отчество</label>
              <input name="patronymic" class="form-control" value="${escapeHtml(data.patronymic || "")}" required minlength="2" autocomplete="additional-name" />
              <div class="text-danger small field-error mt-1" data-field="patronymic"></div>
            </div>
            <div class="col-12">
              <button type="submit" class="btn btn-primary" id="btn-doctor-profile-save">Сохранить</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const form = pageEl.querySelector("#doctor-profile-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const errors = validatePayload(payload);
    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      showAlert("danger", "Проверьте корректность полей.");
      return;
    }
    const btn = pageEl.querySelector("#btn-doctor-profile-save");
    const prev = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Сохранение…";
    }
    try {
      await api.doctor.updateMyProfile(payload);
      showAlert("success", "Профиль сохранён");
    } catch (err) {
      showAlert("danger", err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prev || "Сохранить";
      }
    }
  });
}
