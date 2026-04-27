import { showAlert } from "../components/alerts.js";
import { getAuth, isAuthed } from "./auth.js?v=3";

const POLL_MS = 48000;
const STORAGE = "genapp_admin_seen_gene_symbol_req_ids";
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

function setBadge(n) {
  const el = document.getElementById("admin-gene-req-badge");
  if (el) {
    el.textContent = n > 0 ? String(n) : "";
    el.style.display = n > 0 ? "inline-block" : "none";
  }
}

/**
 * Пациентские заявки на гены, которых нет в справочнике: поллинг + бейдж в меню, алерт о новых.
 */
export function startAdminGeneRequestPolling(api) {
  stopAdminGeneRequestPolling();
  const tick = async () => {
    if (!isAuthed() || getAuth().role !== "admin") return;
    let n = 0;
    try {
      const d = await api.admin.getGeneSymbolRequestPendingCount();
      n = d?.pending_count ?? 0;
    } catch {
      return;
    }
    setBadge(n);
    if (!n) return;
    let items = [];
    try {
      const list = await api.admin.listGeneSymbolRequests({ status: "pending" });
      items = Array.isArray(list) ? list : [];
    } catch {
      return;
    }
    const seen = getSeen();
    const fresh = items.filter((i) => i?.id != null && !seen.has(Number(i.id)));
    if (!fresh.length) return;
    fresh.forEach((i) => seen.add(Number(i.id)));
    setSeen(seen);

    const t =
      fresh.length === 1
        ? `Заявка: добавить ген ${(fresh[0].symbol || "?").toString()}.`
        : `${n} заявок на новые гены.`;
    showAlert("info", `${t} Откройте «Заявки: новые гены» в разделе администратора.`.slice(0, 500));

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Справочник генов", {
        body: t,
        tag: "genapp-admin-gene-req",
      });
    }
  };
  void tick();
  intervalId = window.setInterval(tick, POLL_MS);
}

export function stopAdminGeneRequestPolling() {
  if (intervalId != null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}
