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
        <div class="mb-3 p-3 border rounded bg-light">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="reg-consent" required />
            <label class="form-check-label" for="reg-consent">Я соглашаюсь на обработку моих <strong>персональных данных</strong> и <strong>сведений, относящихся к моему здоровью</strong> (в т.ч. вносимых в кабинет) в целях работы этого сервиса. Ознакомьте пользователя с полнотекстовой <a href="#/articles" class="text-primary">документацией</a> и политикой на продакшене.</label>
          </div>
        </div>
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
    const consent = Boolean(document.getElementById("reg-consent")?.checked);
    payload.consent_personal_data = consent;
    if (!consent) {
      showAlert("warning", "Поставьте согласие на обработку персональных и медицинских по смыслу 152-ФЗ данных — без него кабинет не используется.");
      return;
    }
    try {
      await api.auth.register(payload);
      window.location.hash = "#/login";
    } catch (err) {
      showAlert("danger", err.message);
    }
  });
}

