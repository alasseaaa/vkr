import { clearAuth, getAuth, isAuthed } from "../services/auth.js";
import { getWithoutGeneticTestFlag } from "../services/wellness.js";

function navItemHtml(item, currentHash) {
  const active = item.external ? false : `#${item.href}` === currentHash;
  const cls = `nav-link py-2 px-2 text-dark ${item.icon ? "d-flex align-items-center" : ""}`;
  if (item.external) {
    return `
      <a class="${cls}" href="${item.href}" data-external="true">
        ${item.icon ? `<i class="bi ${item.icon} me-2"></i>` : ""}
        ${item.label}
      </a>
    `;
  }
  return `
    <a class="${cls}" data-href="#${item.href}" href="#${item.href}" data-active="${active}">
      ${item.icon ? `<i class="bi ${item.icon} me-2"></i>` : ""}
      ${item.label}
    </a>
  `;
}

export function renderSidebar() {
  const { role, username } = getAuth();
  const sidebarEl = document.getElementById("sidebar");
  const accountEl = document.getElementById("account-block");
  const logoutBtn = document.getElementById("btn-logout");

  if (!sidebarEl) return;

  const currentHash = window.location.hash || "";
  const items = [];

  if (!isAuthed()) {
    items.push({ href: "/", label: "Главная", icon: "bi-house-door", external: true });
  }
  items.push({ href: "/articles", label: "Статьи", icon: "bi-newspaper" });
  items.push({ href: "/myth-truth", label: "Миф или правда?", icon: "bi-patch-question" });

  if (role === "patient" || role === "admin") {
    items.push({ href: "/symptom-test", label: "Анализы по симптомам", icon: "bi-clipboard2-pulse" });
  }

  if (role === "patient") {
    const wellness = getWithoutGeneticTestFlag();
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
  } else if (role === "doctor") {
    items.push({ href: "/doctor/appointments", label: "Заявки на приём", icon: "bi-calendar-event" });
    items.push({ href: "/doctor/patients", label: "Пациенты", icon: "bi-people" });
  } else if (role === "admin") {
    items.push({ href: "/profile", label: "Профиль", icon: "bi-person-vcard" });
    items.push({ href: "/admin/genes", label: "Гены", icon: "bi-database" });
    items.push({ href: "/admin/gene-variants", label: "Варианты генов", icon: "bi-diagram-3" });
    items.push({ href: "/admin/recommendations", label: "Рекомендации (админ)", icon: "bi-lightbulb" });
  }

  if (!isAuthed()) {
    items.push({ href: "/login", label: "Вход", icon: "bi-box-arrow-in-right" });
    items.push({ href: "/register", label: "Регистрация", icon: "bi-person-plus" });
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
