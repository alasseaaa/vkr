import { setBasicAuth } from "../services/auth.js?v=8";

function renderShell(pageEl, innerHtml) {
  pageEl.innerHTML = `
    <div class="row justify-content-center">
      <div class="col-lg-6">
        <div class="card shadow-sm">
          ${innerHtml}
        </div>
      </div>
    </div>
  `;
}

export async function render(pageEl, { api, showAlert }) {
  renderShell(
    pageEl,
    `
    <div class="card-header bg-white">
      <h5 class="mb-0">Регистрация</h5>
      <div class="text-muted small">Создайте учетную запись пациента</div>
    </div>
    <div class="card-body">
      <form id="register-form">
        <div class="mb-3">
          <label class="form-label">Имя пользователя</label>
          <input name="username" type="text" class="form-control" required />
        </div>
        <div class="mb-3">
          <label class="form-label">Email</label>
          <input name="email" type="email" class="form-control" required />
        </div>
        <div class="row g-2">
          <div class="col-md-6 mb-3">
            <label class="form-label">Имя</label>
            <input name="first_name" type="text" class="form-control" required />
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Фамилия</label>
            <input name="last_name" type="text" class="form-control" required />
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">Отчество</label>
          <input name="patronymic" type="text" class="form-control" required minlength="2" autocomplete="additional-name" />
        </div>
        <div class="row g-2">
          <div class="col-md-6 mb-3">
            <label class="form-label">Пароль</label>
            <input name="password1" type="password" class="form-control" required />
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Повтор пароля</label>
            <input name="password2" type="password" class="form-control" required />
          </div>
        </div>
        <p class="text-muted small">После создания аккаунта откроется экран <strong>согласия на обработку персональных данных</strong>. Без согласия кабинет и сервис с данными о здоровье не используются (152-ФЗ); сам текст можно внимательно прочитать и подтвердить чекбоксом сразу после регистрации.</p>
        <div class="mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="reg-without-gt" />
            <label class="form-check-label" for="reg-without-gt">Пока не планирую добавлять результаты генетического теста</label>
          </div>
          <div class="text-muted small mt-1">Включим упрощённый интерфейс и подборку статей «Общее здоровье». Позже это можно изменить в профиле.</div>
        </div>
        <div class="d-grid gap-2">
          <button class="btn btn-primary" type="submit">Создать аккаунт</button>
          <a class="btn btn-outline-secondary" href="#/login">Назад</a>
        </div>
      </form>
    </div>
  `,
  );

  const form = pageEl.querySelector("#register-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.without_genetic_test = Boolean(document.getElementById("reg-without-gt")?.checked);
    try {
      await api.auth.register(payload);
      const res = await api.auth.login({
        email: payload.email,
        password: payload.password1,
      });
      setBasicAuth({
        username: res.username,
        password: payload.password1,
        role: res.role,
        userId: res.id,
      });
      if (res.role === "patient") {
        try {
          sessionStorage.setItem("genapp_just_registered", "1");
        } catch {
          /* */
        }
      }
      const setConsentFlag = (id) => {
        if (id == null) return;
        try {
          sessionStorage.setItem(`consent_ok_${id}`, "1");
        } catch {
          /* ignore */
        }
      };
      if (res.role === "patient") {
        if (res.needs_consent) window.location.hash = "#/consent";
        else {
          setConsentFlag(res.id);
          window.location.hash = "#/dashboard";
        }
      } else if (res.role === "admin") {
        if (res.needs_consent) window.location.hash = "#/consent";
        else {
          setConsentFlag(res.id);
          window.location.hash = "#/admin/genes";
        }
      } else if (res.role === "doctor") {
        window.location.hash = "#/doctor/patients";
      } else if (res.role === "nurse") {
        window.location.hash = "#/nurse/profile";
      } else {
        window.location.hash = "#/admin/genes";
      }
    } catch (err) {
      showAlert("danger", err.message);
    }
  });
}

