import { showAlert } from "../components/alerts.js";
import { getAuth, isAuthed } from "./auth.js?v=3";

const POLL_MS = 40000;
const STORAGE = "genapp_nurse_notified_upload_ids";
let intervalId = null;

function getSeen() {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    const a = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(a) ? a : []).map(Number).filter((x) => Number.isFinite(x)));
  } catch {
    return new Set();
  }
}

function setSeen(s) {
  try {
    sessionStorage.setItem(STORAGE, JSON.stringify([...s]));
  } catch {
    /* */
  }
}

/**
 * Polling: новые уведомления о PDF (unread) — алерт, как у пациента.
 */
export function startNurseNotificationPolling(api) {
  stopNurseNotificationPolling();
  const tick = async () => {
    if (!isAuthed() || getAuth().role !== "nurse") return;
    let data;
    try {
      data = await api.nurse.getUnreadNurseUploadNotifications();
    } catch {
      return;
    }
    const n = data?.unread_count ?? 0;
    if (!n) return;
    const items = Array.isArray(data?.items) ? data.items : [];
    const seen = getSeen();
    const fresh = items.filter((i) => i?.id != null && !seen.has(Number(i.id)));
    if (!fresh.length) return;
    fresh.forEach((i) => seen.add(Number(i.id)));
    setSeen(seen);

    const t =
      n === 1
        ? `Новая PDF-заявка от @${(fresh[0].patient_username || "пациент").toString()}.`
        : `${n} новых заявок с PDF.`;
    showAlert("info", `${t} Откройте «PDF из раздела „Гены“».`.slice(0, 500));

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Генетические PDF", {
        body: t,
        tag: "genapp-nurse-pdf",
      });
    }
  };
  tick();
  intervalId = window.setInterval(tick, POLL_MS);
}

export function stopNurseNotificationPolling() {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}
