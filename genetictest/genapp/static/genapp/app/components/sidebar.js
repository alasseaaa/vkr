import { clearAuth, getAuth, isAuthed, getEffectiveRole } from "../services/auth.js?v=8";
import { getWithoutGeneticTestFlag } from "../services/wellness.js";

function navItemHtml(item, currentHash) {
  if (item.section) {
    const lab = String(item.section)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return `<div class="text-uppercase text-muted small fw-semibold px-2 pt-3 pb-0 mb-0" style="font-size:0.72rem;letter-spacing:0.04em">${lab}</div>`;
  }
  const active = item.external ? false : `#${item.href}` === currentHash;
  const cls = `nav-link py-2 px-2 text-dark ${item.icon ? "d-flex align-items-center" : ""}`;
  const badge = item.badgeId
    ? ` <span class="badge text-bg-danger ms-1" id="${item.badgeId}" data-nurse-nav-badge="1" style="display:none">0</span>`
    : "";
  if (item.external) {
    return `
      <a class="${cls}" href="${item.href}" data-external="true">
        ${item.icon ? `<i class="bi ${item.icon} me-2"></i>` : ""}
        ${item.label}${badge}
      </a>
    `;
  }
  return `
    <a class="${cls}" data-href="#${item.href}" href="#${item.href}" data-active="${active}">
      ${item.icon ? `<i class="bi ${item.icon} me-2"></i>` : ""}
      ${item.label}${badge}
    </a>
  `;
}

const ART = { href: "/articles", label: "Статьи", icon: "bi-newspaper" };
const MYTH = { href: "/myth-truth", label: "Миф или правда?", icon: "bi-patch-question" };
const SYM = { href: "/symptom-test", label: "Анализы по симптомам", icon: "bi-clipboard2-pulse" };

export function renderSidebar() {
  const { username } = getAuth();
  const role = getEffectiveRole();
  const sidebarEl = document.getElementById("sidebar");
  const accountEl = document.getElementById("account-block");
  const logoutBtn = document.getElementById("btn-logout");

  if (!sidebarEl) return;

  const currentHash = window.location.hash || "";
  const items = [];

  if (!isAuthed()) {
    items.push({ href: "/", label: "Главная", icon: "bi-house-door", external: true });
    items.push(ART);
    items.push({ href: "/login", label: "Вход", icon: "bi-box-arrow-in-right" });
    items.push({ href: "/register", label: "Регистрация", icon: "bi-person-plus" });
  } 
  else if (role === "nurse") {
    // ----- МЕДСЕСТРА (НЕТ MYTH и SYM) -----
    items.push(ART);
    items.push({ section: "Пациенты (PDF)" });
    items.push({
      href: "/nurse/genetic-uploads",
      label: "Пациенты с PDF-заявками",
      icon: "bi-people",
      badgeId: "nurse-nav-badge",
    });
    items.push({
      href: "/nurse/profile",
      label: "Внести варианты в карточку",
      icon: "bi-clipboard2-data",
    });
  } 
  else if (role === "doctor") {
    items.push(ART);
    items.push({ href: "/doctor/appointments", label: "Заявки на приём", icon: "bi-calendar-event" });
    items.push({ href: "/doctor/patients", label: "Пациенты", icon: "bi-people" });
  } 
  else if (role === "patient") {
    const wellness = getWithoutGeneticTestFlag();
    items.push(ART);
    items.push(MYTH, SYM);
    items.push({ href: "/dashboard", label: "Дашборд", icon: "bi-speedometer2" });
    items.push({ href: "/profile", label: "Профиль", icon: "bi-person-vcard" });
    if (!wellness) {
      items.push({ href: "/genotypes", label: "Генетические данные", icon: "bi-dna" });
    }
    items.push({ href: "/vitamin-tests", label: "Анализы витаминов", icon: "bi-droplet" });
    items.push({ href: "/recommendations", label: "Рекомендации", icon: "bi-stars" });
    if (!wellness) {
      items.push({ href: "/passport", label: "Генетический паспорт", icon: "bi-person-badge" });
    }
    items.push({ href: "/appointments", label: "Запись к врачу", icon: "bi-calendar-check" });
    items.push({ href: "/patient/consultations", label: "История консультаций", icon: "bi-chat-square-text" });
  } 
  else if (role === "admin") {
    items.push(ART);
    items.push(MYTH, SYM);
    items.push({ href: "/profile", label: "Профиль", icon: "bi-person-vcard" });
    items.push({ section: "Редактирование контента" });
    items.push({ href: "/admin/myth-truth", label: "Миф/правда (вопросы)", icon: "bi-patch-question" });
    items.push({ href: "/admin/symptom-items", label: "Симптомы (тест)", icon: "bi-clipboard2-pulse" });
    items.push({ href: "/admin/content/articles", label: "Статьи", icon: "bi-journal-richtext" });
    items.push({ section: "Справочники" });
    items.push({ href: "/admin/genes", label: "Гены", icon: "bi-database" });
    items.push({ href: "/admin/gene-variants", label: "Варианты генов", icon: "bi-diagram-3" });
    items.push({ href: "/admin/recommendations", label: "Рекомендации (админ)", icon: "bi-lightbulb" });
    items.push({ section: "Пользователи" });
    items.push({ href: "/admin/user-roles", label: "Врач / медсестра", icon: "bi-person-badge" });
  } 
  else {
    items.push(ART);
  }

  sidebarEl.innerHTML = `
    <nav class="nav flex-column gap-1">
      ${items.map((i) => navItemHtml(i, currentHash)).join("")}
    </nav>
  `;

  if (accountEl) {
    accountEl.textContent = username ? `@${username}` : isAuthed() ? "" : "Гость";
  }

  if (logoutBtn) {
    const visible = isAuthed();
    logoutBtn.classList.toggle("d-none", !visible);
    logoutBtn.onclick = () => {
      clearAuth();
      window.location.href = "/logout/";
    };
  }

  sidebarEl.querySelectorAll("a[data-href]").forEach((a) => {
    const href = a.getAttribute("data-href");
    a.dataset.active = href === currentHash;
  });
}