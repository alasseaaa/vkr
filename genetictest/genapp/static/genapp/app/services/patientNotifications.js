import { showAlert } from "../components/alerts.js";
import { getAuth, isAuthed } from "./auth.js?v=3";

const STORAGE_KEY = "genapp_push_announced_ids";
const POLL_MS = 35000;

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

function handleNewNotifications(items, api) {
  if (!items?.length) return;
  const announced = loadAnnouncedIds();
  const fresh = items.filter((n) => n?.id != null && !announced.has(Number(n.id)));
  if (!fresh.length) return;
  fresh.forEach((n) => announced.add(Number(n.id)));
  saveAnnouncedIds(announced);

  let title;
  let body;
  if (fresh.length === 1) {
    title = fresh[0].title || "Комментарий врача";
    body = fresh[0].body || "";
  } else {
    title = "Новые уведомления";
    body = `Вам ${fresh.length} новых сообщений. Откройте «Историю консультаций» или «Запись к врачу».`;
  }

  showAlert("info", `${title}. ${body}`.trim().slice(0, 500));

  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
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
