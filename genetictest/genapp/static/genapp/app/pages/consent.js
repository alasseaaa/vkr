import { getAuth } from "../services/auth.js";
import {
  CONSENT_INTRO_LINE,
  getConsentScrollableHtml,
} from "../data/consentText.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markConsentSession(userId) {
  if (userId != null) {
    try {
      sessionStorage.setItem(`consent_ok_${userId}`, "1");
    } catch {
      /* storage full / private mode */
    }
  }
}

/**
 * Согласие на обработку ПДн и сведений о здоровье перед использованием кабинета.
 */
export async function render(pageEl, { api, showAlert, auth: authCtx }) {
  const auth = authCtx || getAuth();
  const role = String(auth?.role || "").toLowerCase();
  if (role === "doctor") {
    pageEl.innerHTML = `<div class="app-page"><p class="text-muted">Недоступно для роли врача.</p>
      <a href="#/doctor/patients" class="btn btn-outline-primary">К врачебному кабинету</a></div>`;
    return;
  }

  let profile;
  try {
    profile = await api.patient.getProfile();
  } catch (e) {
    pageEl.innerHTML = `<div class="app-page"><div class="alert alert-danger">${escapeHtml(e.message || "Ошибка")}</div>
      <a href="#/login" class="btn btn-outline-secondary">Вход</a></div>`;
    return;
  }

  if (profile.consent_personal_data_at) {
    markConsentSession(getAuth().userId ?? profile.id);
    if (role === "admin") window.location.hash = "#/admin/genes";
    else window.location.hash = "#/dashboard";
    return;
  }

  pageEl.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-lg-8 col-xl-7">
        <div class="card shadow border-0">
          <div class="card-header bg-primary text-white py-3">
            <h1 class="h4 mb-0">Согласие на обработку данных</h1>
          </div>
          <div class="card-body p-4">
            <p class="text-muted small mb-3">${escapeHtml(CONSENT_INTRO_LINE)}</p>
            <div class="border rounded p-3 mb-3 bg-light small" style="max-height: 280px; overflow-y: auto">
              ${getConsentScrollableHtml()}
            </div>
            <form id="consent-form" class="vstack gap-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="consent-check" name="agree" required />
                <label class="form-check-label" for="consent-check">Я внимательно прочитал(а) текст, понимаю, что передаю персональные и <strong>медицинские</strong> по смыслу 152-ФЗ данные, и <strong>даю согласие</strong> на их обработку на условиях, изложенных выше, для использования этого кабинета.</label>
              </div>
              <div class="d-flex flex-wrap gap-2">
                <button type="submit" class="btn btn-primary btn-lg">Сохранить согласие и перейти в кабинет</button>
                <a class="btn btn-outline-secondary" href="/logout/">Выйти из аккаунта</a>
              </div>
            </form>
            <p class="text-muted small mt-3 mb-0">При сомнениях проконсультируйтесь с врачом. Техническая кнопка — не врачебная консультация.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  pageEl.querySelector("#consent-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!pageEl.querySelector("#consent-check")?.checked) {
      showAlert("warning", "Поставьте отметку, подтверждающую согласие.");
      return;
    }
    try {
      await api.patient.updateProfile({ consent_personal_data: true });
      const uid = getAuth().userId ?? profile.id;
      markConsentSession(uid);
      showAlert("success", "Согласие сохранено.");
      if (getAuth().role === "admin") window.location.hash = "#/admin/genes";
      else window.location.hash = "#/dashboard";
    } catch (err) {
      showAlert("danger", err?.message || "Ошибка сохранения");
    }
  });
}
