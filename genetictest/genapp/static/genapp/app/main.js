import { parseRoute } from "./router.js?v=10";
import { showAlert, clearAlert } from "./components/alerts.js";
import { renderSidebar } from "./components/sidebar.js";
import { getAuth, isAuthed, setStoredRole, getEffectiveRole, NURSE_PROBE_ONCE_KEY } from "./services/auth.js?v=8";
import { api } from "./services/api.js?v=11";
import {
  startPatientNotificationPolling,
  stopPatientNotificationPolling,
} from "./services/patientNotifications.js";
import {
  startNurseNotificationPolling,
  stopNurseNotificationPolling,
} from "./services/nurseNotifications.js";
import { syncPatientWellnessFromProfile } from "./services/wellness.js";

/** Пациент и админ: без даты согласия в профиле — редирект на #/consent. */
async function ensureConsentForPatientRoutes(route) {
  if (!isAuthed()) return true;
  const r = getEffectiveRole() || "";
  if (r !== "patient" && r !== "admin") return true;
  if (route.name === "consent") return true;
  const uid = getAuth().userId;
  if (uid != null) {
    try {
      if (sessionStorage.getItem(`consent_ok_${uid}`) === "1") return true;
    } catch {
      /* ignore */
    }
  }
  try {
    const p = await api.patient.getProfile();
    if (p.consent_personal_data_at) {
      if (uid != null) {
        try {
          sessionStorage.setItem(`consent_ok_${uid}`, "1");
        } catch {
          /* ignore */
        }
      }
      return true;
    }
  } catch {
    return true;
  }
  if (String(window.location.hash).replace(/^#/, "") !== "/consent") {
    window.location.hash = "#/consent";
  }
  return false;
}

async function renderPage(route) {
  const pageEl = document.getElementById("page");
  if (!pageEl) return;
  pageEl.innerHTML = "";

  const auth = getAuth();
  const r = getEffectiveRole();
  const ctx = { api, auth, showAlert };

  const requireAuth = (name) => {
    const publicRoutes = new Set(["login", "register", "articles", "article-detail"]);
    return !publicRoutes.has(name);
  };

  if (!isAuthed() && requireAuth(route.name)) {
    window.location.hash = "#/login";
    return;
  }

  if (route.name === "myth-truth" && isAuthed() && r !== "patient" && r !== "admin") {
    if (r === "nurse") window.location.hash = "#/nurse/profile";
    else if (r === "doctor") window.location.hash = "#/doctor/patients";
    else window.location.hash = "#/admin/genes";
    return;
  }

  if (route.name === "symptom-test" && isAuthed() && r !== "patient" && r !== "admin") {
    if (r === "nurse") window.location.hash = "#/nurse/profile";
    else if (r === "doctor") window.location.hash = "#/doctor/patients";
    else window.location.hash = "#/admin/genes";
    return;
  }

  if (route.name === "profile" && isAuthed() && r === "doctor") {
    window.location.hash = "#/doctor/patients";
    return;
  }
  if (route.name === "profile" && isAuthed() && r === "nurse") {
    window.location.hash = "#/nurse/profile";
    return;
  }

  if (route.name === "redirect") {
    if (!isAuthed()) window.location.hash = "#/login";
    else {
      if (r === "patient") window.location.hash = "#/dashboard";
      else if (r === "doctor") window.location.hash = "#/doctor/patients";
      else if (r === "nurse") window.location.hash = "#/nurse/profile";
      else window.location.hash = "#/admin/genes";
    }
    return;
  }

  if (isAuthed() && r === "nurse") {
    const nurseAllowed = new Set([
      "articles",
      "article-detail",
      "nurse-profile",
      "nurse-genetic-uploads",
      "nurse-patient-genotypes",
    ]);
    if (!nurseAllowed.has(route.name)) {
      window.location.hash = "#/nurse/profile";
      return;
    }
  }

  if (isAuthed() && r !== "admin" && String(route.name || "").startsWith("admin-")) {
    if (r === "nurse") window.location.hash = "#/nurse/profile";
    else if (r === "doctor") window.location.hash = "#/doctor/patients";
    else if (r === "patient") window.location.hash = "#/dashboard";
    else window.location.hash = "#/login";
    return;
  }

  const moduleMap = {
    login: () => import("./pages/login.js"),
    register: () => import("./pages/register.js?v=2"),
    articles: () => import("./pages/articles.js?v=2"),
    "myth-truth": () => import("./pages/mythTruth.js?v=1"),
    consent: () => import("./pages/consent.js?v=2"),
    "symptom-test": () => import("./pages/symptomTest.js?v=6"),
    "article-detail": () => import("./pages/articles.js?v=2"),
    dashboard: () => import("./pages/dashboard.js?v=8"),
    genotypes: () => import("./pages/genotypes.js?v=8"),
    "nurse-genetic-uploads": () => import("./pages/nurse/geneticUploads.js?v=3"),
    "nurse-patient-genotypes": () => import("./pages/nurse/patientGenotypes.js?v=3"),
    "nurse-profile": () => import("./pages/nurse/profile.js?v=4"),
    "vitamin-tests": () => import("./pages/vitaminTests.js"),
    recommendations: () => import("./pages/recommendations.js"),
    passport: () => import("./pages/passport.js?v=3"),
    "patient-consultations": () => import("./pages/patient/consultations.js"),
    "patient-appointments": () => import("./pages/patient/appointments.js?v=2"),
    profile: () => import("./pages/profile.js?v=2"),
    "doctor-appointments": () => import("./pages/doctor/appointments.js"),
    "doctor-patients": () => import("./pages/doctor/patients.js"),
    "doctor-profile": () => import("./pages/doctor/profile.js"),
    "admin-genes": () => import("./pages/admin/genes.js"),
    "admin-gene-variants": () => import("./pages/admin/geneVariants.js"),
    "admin-recommendations": () => import("./pages/admin/recommendations.js"),
    "admin-myth-truth": () => import("./pages/admin/mythTruthAdmin.js"),
    "admin-symptom-items": () => import("./pages/admin/symptomItemsAdmin.js?v=2"),
    "admin-content-articles": () => import("./pages/admin/articlesCms.js"),
    "admin-user-roles": () => import("./pages/admin/userRoles.js"),
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
  if (isAuthed()) {
    try {
      const me = await api.auth.me();
      if (me?.role != null) {
        setStoredRole(me.role);
      }
    } catch {
      /* 401 / сеть — остаётся роль из localStorage */
    }
    // Если /auth/me/ + localStorage дают «patient», а у пользователя реально есть доступ IsNurse — роль «nurse» до отрисовки меню
    if (getEffectiveRole() === "patient") {
      let probed = false;
      try {
        probed = sessionStorage.getItem(NURSE_PROBE_ONCE_KEY) === "1";
      } catch {
        /* */
      }
      if (!probed) {
        try {
          await api.nurse.getUnreadNurseUploadNotifications();
          setStoredRole("nurse");
          try {
            sessionStorage.setItem(NURSE_PROBE_ONCE_KEY, "1");
          } catch {
            /* */
          }
        } catch (e) {
          if (e?.status === 403) {
            try {
              sessionStorage.setItem(NURSE_PROBE_ONCE_KEY, "1");
            } catch {
              /* */
            }
          }
          /* 401 / сеть — флаг не ставим, на следующем renderApp повторим */
        }
      }
    }
  }
  const authed = isAuthed();
  const role = getEffectiveRole();
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
    if (!(await ensureConsentForPatientRoutes(route))) {
      return;
    }
    await renderPage(route);
  } catch (e) {
    showAlert("danger", e?.message || "Ошибка");
  }

  const a = getAuth();
  const ar = getEffectiveRole();
  if (isAuthed() && ar === "patient") {
    startPatientNotificationPolling(api);
  } else {
    stopPatientNotificationPolling();
  }
  if (isAuthed() && ar === "nurse") {
    startNurseNotificationPolling(api);
    try {
      const d = await api.nurse.getUnreadNurseUploadNotifications();
      const c = d?.unread_count ?? 0;
      const el = document.getElementById("nurse-nav-badge");
      if (el) {
        el.textContent = c > 0 ? String(c) : "";
        el.style.display = c > 0 ? "inline-block" : "none";
      }
    } catch {
      /* */
    }
  } else {
    stopNurseNotificationPolling();
  }
}

window.addEventListener("hashchange", () => {
  renderApp();
});

renderApp();

