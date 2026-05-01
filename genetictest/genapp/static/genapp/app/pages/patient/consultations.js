import { doctorCommentBodyHtml } from "../../components/doctorComment.js?v=3";

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayLabel(value) {
  const d = parseDate(value);
  if (!d) return "Без даты";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export async function render(pageEl, { api, showAlert }) {
  pageEl.innerHTML = `<div class="card app-card"><div class="card-body">Загрузка истории…</div></div>`;

  try {
    const u = await api.patient.getUnreadNotifications();
    const ids = (u?.items || []).map((x) => Number(x.id)).filter((x) => Number.isFinite(x));
    if (ids.length) await api.patient.markNotificationsRead(ids);
  } catch {
    /* нет прав или сеть */
  }

  let items = [];
  try {
    const data = await api.comments.list({});
    items = Array.isArray(data) ? data : [];
  } catch (err) {
    showAlert("danger", err.message);
    pageEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    return;
  }

  const LAST_SEEN_KEY = "patient_consultations_last_seen_at";
  let lastSeen = null;
  try {
    lastSeen = parseDate(localStorage.getItem(LAST_SEEN_KEY));
  } catch {
    /* ignore */
  }

  items.sort((a, b) => {
    const da = parseDate(a.created_at);
    const db = parseDate(b.created_at);
    const ta = da ? da.getTime() : 0;
    const tb = db ? db.getTime() : 0;
    return tb - ta;
  });
  const newestSeenDate = items.reduce((acc, item) => {
    const d = parseDate(item.created_at);
    if (!d) return acc;
    if (!acc) return d;
    return d.getTime() > acc.getTime() ? d : acc;
  }, null);

  const grouped = new Map();
  items.forEach((c) => {
    const key = dayLabel(c.created_at);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(c);
  });

  const cards = items.length
    ? Array.from(grouped.entries())
        .map(([groupTitle, groupItems]) => {
          const groupCards = groupItems
            .map((c) => {
              const created = parseDate(c.created_at);
              const isNew = Boolean(lastSeen && created && created.getTime() > lastSeen.getTime());
              let extra = "";
              if (c.genetic_result_id) {
                extra = `<a class="btn btn-sm btn-outline-secondary mt-2" href="#/passport/genotype/${c.genetic_result_id}">📊 К паспорту</a>`;
              } else if (c.vitamin_reading_id) {
                extra = `<a class="btn btn-sm btn-outline-secondary mt-2" href="#/vitamins/focus/${c.vitamin_reading_id}">💊 К анализу</a>`;
              } else {
                extra = `<span class="badge text-bg-secondary mt-2 d-inline-block">💬 Общая рекомендация врача</span>`;
              }
              return `
                <div class="card app-card consultation-card mb-4 ${isNew ? "consultation-card-new" : ""}" id="consultation-${c.id}">
                  <div class="card-body">
                    ${doctorCommentBodyHtml(c, { isNew })}
                    ${extra}
                  </div>
                </div>`;
            })
            .join("");
          return `<div class="consultation-group mb-2"><div class="consultation-group-title">${escapeHtml(groupTitle)}</div>${groupCards}</div>`;
        })
        .join("")
    : `
      <div class="card app-card border-0 shadow-sm">
        <div class="card-body">
          <div class="h6 mb-3">💬 История консультаций пуста</div>
          <div class="text-muted mb-3">Чтобы получить комментарий от врача:</div>
          <ol class="small text-muted ps-3 mb-3">
            <li>Перейдите в раздел «Запись к врачу»</li>
            <li>Выберите врача и запишитесь на приём</li>
            <li>После консультации врач оставит комментарий здесь</li>
          </ol>
          <a class="btn btn-outline-primary btn-sm" href="#/appointments">Записаться к врачу</a>
        </div>
      </div>`;

  pageEl.innerHTML = `
    <div class="app-page">
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h3 class="mb-0">История консультаций</h3>
        <a class="btn btn-outline-secondary btn-sm" href="#/dashboard">На дашборд</a>
      </div>
      <p class="text-muted small mb-4">Опубликованные комментарии лечащего врача (новые сверху).</p>
      ${cards}
    </div>
  `;

  try {
    localStorage.setItem(LAST_SEEN_KEY, (newestSeenDate || new Date()).toISOString());
  } catch {
    /* ignore */
  }
}
