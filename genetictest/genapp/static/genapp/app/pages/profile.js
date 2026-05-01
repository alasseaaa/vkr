const GENDER_OPTS = [
  { v: "", t: "Не указано" },
  { v: "male", t: "Мужской" },
  { v: "female", t: "Женский" },
];

const ACTIVITY_OPTS = [
  { v: "", t: "Не указано" },
  { v: "low", t: "Низкий" },
  { v: "medium", t: "Средний" },
  { v: "high", t: "Высокий" },
];

import { renderSidebar } from "../components/sidebar.js";
import { getWithoutGeneticTestFlag, setWithoutGeneticTestFlag } from "../services/wellness.js";
import { getConsentScrollableHtml, CONSENT_CHECKBOX_WARRANTY_LINE } from "../data/consentText.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function optHtml(options, selected) {
  return options
    .map((o) => `<option value="${escapeHtml(o.v)}" ${String(selected) === String(o.v) ? "selected" : ""}>${escapeHtml(o.t)}</option>`)
    .join("");
}

function formatConsentDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(String(iso));
  return d.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" });
}

function hasPersonalDataConsent(data) {
  if (data == null) return false;
  if (data.has_personal_data_consent === true) return true;
  const t = data.consent_personal_data_at;
  return t != null && String(t).length > 0;
}

function initials(firstName, lastName) {
  const f = String(firstName || "").trim();
  const l = String(lastName || "").trim();
  const fi = f ? f[0].toUpperCase() : "";
  const li = l ? l[0].toUpperCase() : "";
  return `${fi}${li}` || null;
}

function profileCompletion(data) {
  const fields = [
    Boolean(String(data?.first_name || "").trim()),
    Boolean(String(data?.last_name || "").trim()),
    Boolean(String(data?.patronymic || "").trim()),
    Boolean(String(data?.gender || "").trim()),
    Boolean(String(data?.birth_date || "").trim()),
    data?.height != null && String(data.height) !== "",
    data?.weight != null && String(data.weight) !== "",
  ];
  const done = fields.filter(Boolean).length;
  const total = fields.length;
  const pct = Math.round((done / total) * 100);
  return { done, total, pct };
}

function isDateAfterToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return d.getTime() > now.getTime();
}

function validateProfilePayload(payload) {
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
  if (payload.birth_date && isDateAfterToday(payload.birth_date)) {
    errors.birth_date = "Дата рождения не может быть позже текущей даты.";
  }
  if (payload.height != null) {
    if (!Number.isFinite(payload.height) || payload.height < 40 || payload.height > 250) {
      errors.height = "Рост должен быть числом от 40 до 250 см.";
    }
  }
  if (payload.weight != null) {
    if (!Number.isFinite(payload.weight) || payload.weight < 2 || payload.weight > 500) {
      errors.weight = "Вес должен быть числом от 2 до 500 кг.";
    }
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

const KEY_LAST_VISIT = "genapp_dashboard_last_visit";

function readLastVisitLabel() {
  try {
    const raw = sessionStorage.getItem(KEY_LAST_VISIT);
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export async function render(pageEl, { api, showAlert }) {
  pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка профиля…</div></div>`;

  let data;
  try {
    data = await api.patient.getProfile();
  } catch (e) {
    showAlert("danger", e.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
    return;
  }
  const consentOk = hasPersonalDataConsent(data);
  const cmp = profileCompletion(data);
  const init = initials(data.first_name, data.last_name);
  const lastVisitLabel = readLastVisitLabel();

  const wellnessChecked = Boolean(data.without_genetic_test || getWithoutGeneticTestFlag());
  pageEl.innerHTML = `
    <div class="app-page">
    <style>
      .profile-avatar {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(13, 110, 253, 0.12);
        color: #0d6efd;
        font-weight: 700;
      }
      .profile-progress-text { font-size: 0.84rem; color: #6c757d; }
      .wellness-strip {
        background: rgba(13,110,253,0.06);
        border: 1px solid rgba(13,110,253,0.15);
        border-radius: 12px;
      }
      .field-error { min-height: 1.05rem; }
      .spin { display: inline-block; animation: spin .8s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    </style>
    <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
      <div class="d-flex align-items-center gap-2">
        <span class="profile-avatar">
          ${
            init
              ? escapeHtml(init)
              : `<i class="bi bi-person-fill" aria-hidden="true"></i>`
          }
        </span>
        <h1 class="app-page-title h3 mb-0">Профиль пациента</h1>
      </div>
      <a class="btn btn-outline-secondary btn-sm" href="#/dashboard">На дашборд</a>
    </div>
    <p class="text-muted small mb-3"><i class="bi bi-clock-history me-1" aria-hidden="true"></i>Предыдущий визит: <span class="text-body">${escapeHtml(lastVisitLabel)}</span></p>

    <div class="mb-3">
      <div class="profile-progress-text mb-1">Заполнено ${cmp.done} из ${cmp.total} важных полей</div>
      <div class="progress" style="height:.55rem">
        <div class="progress-bar ${cmp.pct >= 100 ? "bg-success" : "bg-primary"}" style="width:${cmp.pct}%"></div>
      </div>
      <div class="profile-progress-text mt-1">${cmp.pct}%</div>
    </div>

    <div class="wellness-strip p-3 mb-3">
      <div class="form-check mb-1">
        <input class="form-check-input" type="checkbox" id="prof-wg-top" ${wellnessChecked ? "checked" : ""} />
        <label class="form-check-label fw-semibold" for="prof-wg-top">🧬 Режим без генетического теста (скрыть разделы с генами)</label>
      </div>
      <div class="text-muted small">Режим можно выключить позже — после этого снова откроются генетические разделы.</div>
    </div>

    <div class="card app-card shadow-sm mb-3" id="profile-pd-consent">
      <div class="card-body">
        <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
          ${
            consentOk
              ? `<div class="small"><span class="text-success fw-semibold">✅ Согласие получено</span> ${formatConsentDate(
                  data.consent_personal_data_at,
                )}</div>`
              : `<div class="alert alert-warning py-2 px-3 mb-0 small">Требуется согласие</div>`
          }
          ${
            consentOk
              ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-bs-toggle="modal" data-bs-target="#profileConsentModal">Показать текст согласия</button>`
              : `<a class="btn btn-sm btn-warning" href="#/consent">Перейти к согласию</a>`
          }
        </div>
      </div>
    </div>

    <div class="card app-card shadow-sm">
      <div class="card-header bg-white">
        <div class="fw-semibold">Личные данные и анкета</div>
        <div class="text-muted small">Логин и email меняются только администратором.</div>
      </div>
      <div class="card-body">
        <form id="profile-form" class="row g-3">
          <div class="col-md-6">
            <label class="form-label small">Логин</label>
            <input class="form-control" value="${escapeHtml(data.username || "")}" disabled />
          </div>
          <div class="col-md-6">
            <label class="form-label small">Email</label>
            <input class="form-control" value="${escapeHtml(data.email || "")}" disabled />
          </div>
          <div class="col-md-6">
            <label class="form-label small">Имя</label>
            <input name="first_name" class="form-control" value="${escapeHtml(data.first_name || "")}" />
            <div class="text-danger small field-error mt-1" data-field="first_name"></div>
          </div>
          <div class="col-md-6">
            <label class="form-label small">Фамилия</label>
            <input name="last_name" class="form-control" value="${escapeHtml(data.last_name || "")}" />
            <div class="text-danger small field-error mt-1" data-field="last_name"></div>
          </div>
          <div class="col-md-6">
            <label class="form-label small">Отчество</label>
            <input name="patronymic" class="form-control" value="${escapeHtml(data.patronymic || "")}" required minlength="2" autocomplete="additional-name" />
            <div class="text-danger small field-error mt-1" data-field="patronymic"></div>
          </div>
          <div class="col-md-4">
            <label class="form-label small">Дата рождения</label>
            <input name="birth_date" type="date" class="form-control" value="${escapeHtml(data.birth_date || "")}" />
            <div class="text-danger small field-error mt-1" data-field="birth_date"></div>
          </div>
          <div class="col-md-4">
            <label class="form-label small">Пол</label>
            <select name="gender" class="form-select">${optHtml(GENDER_OPTS, data.gender || "")}</select>
          </div>
          <div class="col-md-4">
            <label class="form-label small">Активность</label>
            <select name="activity_level" class="form-select">${optHtml(ACTIVITY_OPTS, data.activity_level || "")}</select>
          </div>
          <div class="col-md-6">
            <label class="form-label small">Рост (см)</label>
            <input name="height" type="number" min="40" max="250" class="form-control" value="${data.height != null ? escapeHtml(String(data.height)) : ""}" placeholder="—" />
            <div class="text-danger small field-error mt-1" data-field="height"></div>
          </div>
          <div class="col-md-6">
            <label class="form-label small">Вес (кг)</label>
            <input name="weight" type="number" min="2" max="500" class="form-control" value="${data.weight != null ? escapeHtml(String(data.weight)) : ""}" placeholder="—" />
            <div class="text-danger small field-error mt-1" data-field="weight"></div>
          </div>
          <div class="col-12">
            <label class="form-label small">Пищевые предпочтения</label>
            <textarea name="diet_preferences" class="form-control" rows="2">${escapeHtml(data.diet_preferences || "")}</textarea>
          </div>
          <div class="col-12">
            <label class="form-label small">Цели (например, сон, вес, спорт)</label>
            <textarea name="goals_text" class="form-control" rows="2">${escapeHtml(data.goals_text || "")}</textarea>
          </div>
          <div class="col-12">
            <button type="submit" class="btn btn-primary" id="btn-profile-save">Сохранить</button>
          </div>
        </form>
      </div>
    </div>

    ${
      consentOk
        ? `<div class="modal fade" id="profileConsentModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="h6 mb-0">Текст согласия на обработку данных</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body small">
            ${getConsentScrollableHtml()}
            <hr class="my-3" />
            <p class="mb-0 fst-italic">«${escapeHtml(CONSENT_CHECKBOX_WARRANTY_LINE)}»</p>
          </div>
        </div>
      </div>
    </div>`
        : ""
    }
    </div>
  `;

  const topWg = pageEl.querySelector("#prof-wg-top");
  let wellnessSaving = false;
  if (topWg) {
    topWg.addEventListener("change", async () => {
      if (wellnessSaving) return;
      const prev = getWithoutGeneticTestFlag();
      const next = Boolean(topWg.checked);
      wellnessSaving = true;
      topWg.disabled = true;
      setWithoutGeneticTestFlag(next);
      renderSidebar();
      try {
        const updated = await api.patient.updateProfile({ without_genetic_test: next });
        const persisted =
          updated?.without_genetic_test ??
          updated?.profile?.without_genetic_test ??
          next;
        setWithoutGeneticTestFlag(Boolean(persisted));
        topWg.checked = Boolean(persisted);
        renderSidebar();
        showAlert("success", "Режим обновлён");
      } catch (err) {
        setWithoutGeneticTestFlag(prev);
        topWg.checked = Boolean(prev);
        renderSidebar();
        showAlert("danger", err?.message || "Не удалось сохранить режим");
      } finally {
        wellnessSaving = false;
        topWg.disabled = false;
      }
    });
  }
  pageEl.querySelector("#profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    clearFieldErrors(form);
    const fd = new FormData(form);
    const payload = {};
    for (const [k, v] of fd.entries()) {
      if (k === "height" || k === "weight") {
        const n = v === "" ? null : Number(v);
        payload[k] = Number.isFinite(n) ? n : null;
      } else if (k === "birth_date") {
        payload[k] = v || null;
      } else {
        payload[k] = v;
      }
    }
    payload.without_genetic_test = Boolean(topWg?.checked);
    const errors = validateProfilePayload(payload);
    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      showAlert("danger", "Проверьте корректность заполнения полей.");
      return;
    }
    const saveBtn = pageEl.querySelector("#btn-profile-save");
    const oldHtml = saveBtn?.innerHTML;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spin me-1"><i class="bi bi-arrow-repeat"></i></span>Сохранение...`;
    }
    try {
      const updated = await api.patient.updateProfile(payload);
      const nextWellness =
        updated?.without_genetic_test ??
        updated?.profile?.without_genetic_test ??
        Boolean(topWg?.checked);
      setWithoutGeneticTestFlag(Boolean(nextWellness));
      if (topWg) topWg.checked = Boolean(nextWellness);
      renderSidebar();
      showAlert("success", "Профиль сохранён");
    } catch (err) {
      showAlert("danger", err.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = oldHtml || "Сохранить";
      }
    }
  });
}
