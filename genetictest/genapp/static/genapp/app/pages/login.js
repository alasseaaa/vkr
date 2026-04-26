import { clearAuth, getAuth, setBasicAuth } from "../services/auth.js?v=8";

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

export async function render(pageEl, { api, route, showAlert }) {
  const auth = getAuth();
  if (auth?.role && auth.basicToken) {
    // если уже авторизованы — редирект
    if (auth.role === "patient") window.location.hash = "#/dashboard";
    else if (auth.role === "doctor") window.location.hash = "#/doctor/patients";
    else if (auth.role === "nurse") window.location.hash = "#/nurse/profile";
    else window.location.hash = "#/admin/genes";
    return;
  }

  renderShell(
    pageEl,
    `
    <div class="card-header bg-white">
      <h5 class="mb-0">Вход</h5>
      <div class="text-muted small">Вход только по email и паролю</div>
    </div>
    <div class="card-body">
      <form id="login-form" class="needs-validation" novalidate>
        <div class="mb-3">
          <label class="form-label">Email</label>
          <input name="email" type="email" class="form-control" placeholder="you@example.com" required />
        </div>
        <div class="mb-3">
          <label class="form-label">Пароль</label>
          <input name="password" type="password" class="form-control" required />
        </div>
        <div class="d-grid gap-2">
          <button class="btn btn-primary" type="submit">
            <i class="bi bi-box-arrow-in-right me-1"></i>Войти
          </button>
          <a class="btn btn-outline-secondary" href="#/register">
            Регистрация
          </a>
        </div>
      </form>
    </div>
  `,
  );

  const form = pageEl.querySelector("#login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await api.auth.login(data);
      // backend возвращает username и role
      setBasicAuth({
        username: res.username,
        password: data.password,
        role: res.role,
        userId: res.id,
      });

      const setConsentFlag = (id) => {
        if (id != null) {
          try {
            sessionStorage.setItem(`consent_ok_${id}`, "1");
          } catch {
            /* ignore */
          }
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

