import { showAlert, appendToastHtml, escapeHtml } from "../components/alerts.js?v=3";
import { getAuth, isAuthed } from "./auth.js?v=3";

const STORAGE_KEY = "genapp_push_announced_ids";
const POLL_MS = 35000;

/** Старые записи в БД с прежним заголовком */
const REC_NOTIF_TITLE_LEGACY = "Напоминание по рекомендации";

let intervalId = null;

function loadAnnouncedIds() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(Number) : []);
  } catch {
    return new Set();
  }
}

function saveAnnouncedIds(set) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

function hideToastEl(el) {
  const T = window.bootstrap?.Toast;
  if (el && T) {
    const inst = T.getInstance(el) ?? T.getOrCreateInstance?.(el);
    inst?.hide();
  } else if (el) {
    el.remove();
  }
}

function showRecommendationReminderToast(n, api) {
  const nid = Number(n.id);
  const urid = Number(n.user_recommendation);
  if (!Number.isFinite(nid) || !Number.isFinite(urid)) return;

  const bodyRaw = (n.body || "").trim();
  const titleRaw = (n.title || "").trim();
  const legacyTitle = titleRaw === REC_NOTIF_TITLE_LEGACY;
  const linkText = bodyRaw || (!legacyTitle ? titleRaw : "") || "Рекомендация";

  const href = `#/recommendations?highlight=${encodeURIComponent(String(urid))}`;
  const inner = `
    <div class="d-flex flex-column align-items-stretch gap-2 pe-1">
      <a href="${href}" class="genapp-rec-remind-toast-link text-dark text-decoration-none fw-semibold">${escapeHtml(linkText)}</a>
      <button type="button" class="btn btn-sm btn-success align-self-start genapp-rec-remind-done">Выполнено</button>
    </div>
  `;

  const el = appendToastHtml("info", inner, { delay: 14000 });
  if (!el) return;

  el.querySelector(".genapp-rec-remind-toast-link")?.addEventListener("click", () => {
    api.patient.markNotificationsRead([nid]).catch(() => {});
  });

  el.querySelector(".genapp-rec-remind-done")?.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      await api.push.updateUserSettings({ user_recommendation_id: urid, status: "applied" });
      await api.patient.markNotificationsRead([nid]);
      hideToastEl(el);
      showAlert("success", "Отметили как выполнено.");
    } catch (e) {
      showAlert("danger", e?.message || "Не удалось сохранить.");
    }
  });
}

function showNativeNotificationSingleRec(n, api) {
  const bodyRaw = (n.body || "").trim();
  const titleRaw = (n.title || "").trim();
  const legacyTitle = titleRaw === REC_NOTIF_TITLE_LEGACY;
  const text = bodyRaw || (!legacyTitle ? titleRaw : "") || "Рекомендация";
  const nn = new Notification("", {
    body: text.slice(0, 300),
    tag: `genapp-notif-${n.id}`,
  });
  nn.onclick = () => {
    window.focus();
    window.location.hash = `#/recommendations?highlight=${encodeURIComponent(String(n.user_recommendation))}`;
    nn.close();
    api.patient.markNotificationsRead([Number(n.id)]).catch(() => {});
  };
}

function handleNewNotifications(items, api) {
  if (!items?.length) return;
  const announced = loadAnnouncedIds();
  const fresh = items.filter((n) => n?.id != null && !announced.has(Number(n.id)));
  if (!fresh.length) return;
  fresh.forEach((n) => announced.add(Number(n.id)));
  saveAnnouncedIds(announced);

  const recFresh = fresh.filter((x) => x.user_recommendation != null);
  const otherFresh = fresh.filter((x) => x.user_recommendation == null);

  recFresh.forEach((n) => showRecommendationReminderToast(n, api));

  if (otherFresh.length) {
    let title;
    let body;
    if (otherFresh.length === 1) {
      title = otherFresh[0].title || "Уведомление";
      body = otherFresh[0].body || "";
    } else {
      title = "Новые уведомления";
      body = `Вам ${otherFresh.length} новых сообщений. Откройте «Историю консультаций» или «Запись к врачу».`;
    }
    showAlert("info", `${title}. ${body}`.trim().slice(0, 500));
  }

  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }

  if (recFresh.length === 1 && otherFresh.length === 0) {
    showNativeNotificationSingleRec(recFresh[0], api);
    return;
  }

  if (recFresh.length > 1 && otherFresh.length === 0) {
    const nn = new Notification("Несколько напоминаний", {
      body: "Откройте дашборд — там можно перейти к рекомендациям и отметить выполнение.",
      tag: `genapp-notif-${recFresh.map((x) => x.id).join("-")}`,
    });
    nn.onclick = () => {
      window.focus();
      window.location.hash = "#/dashboard";
      nn.close();
    };
    return;
  }

  let title;
  let body;
  if (fresh.length === 1) {
    title = fresh[0].title || "Уведомление";
    body = fresh[0].body || "";
  } else {
    title = "Новые уведомления";
    body = `Вам ${fresh.length} новых сообщений. Откройте кабинет.`;
  }

  const n = new Notification(title, {
    body: body.slice(0, 300),
    tag: `genapp-notif-${fresh.map((x) => x.id).join("-")}`,
  });
  n.onclick = () => {
    window.focus();
    const recNotif = fresh.find((x) => x.user_recommendation != null);
    const toAppointments = fresh.some((x) => x.appointment != null);
    if (recNotif) {
      window.location.hash = `#/recommendations?highlight=${encodeURIComponent(String(recNotif.user_recommendation))}`;
    } else {
      window.location.hash = toAppointments ? "#/appointments" : "#/patient/consultations";
    }
    n.close();
    const ids = fresh.map((x) => Number(x.id)).filter((x) => Number.isFinite(x));
    if (ids.length) {
      api.patient.markNotificationsRead(ids).catch(() => {});
    }
  };
}

/**
 * Запрос разрешения на системные уведомления (лучше вызывать по клику пользователя).
 */
export async function requestBrowserNotificationPermission() {
  if (typeof Notification === "undefined") {
    showAlert("warning", "Ваш браузер не поддерживает уведомления.");
    return "unsupported";
  }
  const cur = Notification.permission;
  if (cur === "granted") return "granted";
  if (cur === "denied") {
    showAlert("warning", "Уведомления заблокированы в настройках браузера.");
    return "denied";
  }
  const res = await Notification.requestPermission();
  return res;
}

export function startPatientNotificationPolling(api) {
  stopPatientNotificationPolling();
  const tick = async () => {
    const auth = getAuth();
    if (!isAuthed() || auth.role !== "patient") return;
    try {
      const data = await api.patient.getUnreadNotifications();
      const items = data?.items;
      if (Array.isArray(items) && items.length) {
        handleNewNotifications(items, api);
      }
    } catch {
      /* сеть / 403 — тихо */
    }
  };
  tick();
  intervalId = window.setInterval(tick, POLL_MS);
}

export function stopPatientNotificationPolling() {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}
