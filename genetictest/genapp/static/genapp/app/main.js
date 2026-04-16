import { parseRoute } from "./router.js?v=5";
import { showAlert, clearAlert } from "./components/alerts.js";
import { renderSidebar } from "./components/sidebar.js";
import { getAuth, isAuthed } from "./services/auth.js";
import { api } from "./services/api.js?v=3";
import {
  startPatientNotificationPolling,
  stopPatientNotificationPolling,
} from "./services/patientNotifications.js";
import { syncPatientWellnessFromProfile } from "./services/wellness.js";

async function renderPage(route) {
  const pageEl = document.getElementById("page");
  if (!pageEl) return;
  pageEl.innerHTML = "";

  const auth = getAuth();
  const ctx = { api, auth, showAlert };

  const requireAuth = (name) => {
    const publicRoutes = new Set(["login", "register", "articles", "article-detail", "myth-truth"]);
    return !publicRoutes.has(name);
  };

  if (!isAuthed() && requireAuth(route.name)) {
    window.location.hash = "#/login";
    return;
  }

  if (route.name === "profile" && isAuthed() && auth.role === "doctor") {
    window.location.hash = "#/doctor/patients";
    return;
  }

  if (route.name === "redirect") {
    if (!isAuthed()) window.location.hash = "#/login";
    else {
      if (auth.role === "patient") window.location.hash = "#/dashboard";
      else if (auth.role === "doctor") window.location.hash = "#/doctor/patients";
      else window.location.hash = "#/admin/genes";
    }
    return;
  }

  const moduleMap = {
    login: () => import("./pages/login.js"),
    register: () => import("./pages/register.js"),
    articles: () => import("./pages/articles.js"),
    "myth-truth": () => import("./pages/mythTruth.js?v=1"),
    "article-detail": () => import("./pages/articles.js"),
    dashboard: () => import("./pages/dashboard.js?v=5"),
    genotypes: () => import("./pages/genotypes.js?v=3"),
    "vitamin-tests": () => import("./pages/vitaminTests.js"),
    recommendations: () => import("./pages/recommendations.js"),
    passport: () => import("./pages/passport.js?v=3"),
    "patient-consultations": () => import("./pages/patient/consultations.js"),
    "patient-appointments": () => import("./pages/patient/appointments.js?v=2"),
    profile: () => import("./pages/profile.js"),
    "doctor-appointments": () => import("./pages/doctor/appointments.js"),
    "doctor-patients": () => import("./pages/doctor/patients.js"),
    "doctor-profile": () => import("./pages/doctor/profile.js"),
    "admin-genes": () => import("./pages/admin/genes.js"),
    "admin-gene-variants": () => import("./pages/admin/geneVariants.js"),
    "admin-recommendations": () => import("./pages/admin/recommendations.js"),
  };

  const loader = moduleMap[route.name];
  if (!loader) {
    pageEl.innerHTML = `<div class="card"><div class="card-body">Страница не найдена.</div></div>`;
    return;
  }

  const mod = await loader();
  if (typeof mod.render !== "function") {
    pageEl.innerHTML = `<div class="alert alert-danger">Некорректная страница.</div>`;
    return;
  }

  await mod.render(pageEl, { ...ctx, route });
}

async function renderApp() {
  clearAlert();
  const authed = isAuthed();
  const role = getAuth().role;
  if (!authed || role !== "patient") {
    localStorage.removeItem("patient_without_genetic_test");
  } else {
    try {
      await syncPatientWellnessFromProfile(api);
    } catch {
      /* офлайн / ошибка профиля */
    }
  }
  renderSidebar();
  const route = parseRoute();
  try {
    await renderPage(route);
  } catch (e) {
    showAlert("danger", e?.message || "Ошибка");
  }

  const a = getAuth();
  if (isAuthed() && a.role === "patient") {
    startPatientNotificationPolling(api);
  } else {
    stopPatientNotificationPolling();
  }
}

window.addEventListener("hashchange", () => {
  renderApp();
});

renderApp();

