function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function doctorInitial(doctorName) {
  const src = String(doctorName || "").trim();
  if (!src) return "В";
  const parts = src.split(/\s+/).filter(Boolean);
  const surname = parts[0] || src;
  return surname[0].toUpperCase();
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(value) {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Тело комментария (как в истории консультаций): аватар, врач, дата, текст.
 * @param {object} comment
 * @param {{ isNew?: boolean, addTopMargin?: boolean }} [opts] — addTopMargin: false внутри карточки с заголовком
 */
export function doctorCommentBodyHtml(comment, opts = {}) {
  if (!comment) return "";
  const isNew = Boolean(opts.isNew);
  const addTopMargin = opts.addTopMargin !== false;
  const edited = comment.was_edited ? ` <span class="text-muted small">(отредактировано)</span>` : "";
  const doctor = escapeHtml(comment.doctor_name || "Лечащий врач");
  const text = escapeHtml(comment.text || "");
  const initial = escapeHtml(doctorInitial(comment.doctor_name));
  const dateText = fmtDateTime(comment.created_at);
  const newBadge = isNew ? `<span class="badge text-bg-warning ms-2">Новое</span>` : "";
  const marginClass = addTopMargin ? "mt-2" : "";
  return `
    <div class="consultation-doctor-wrap ${marginClass}">
      <div class="d-flex align-items-start gap-2 mb-2">
        <span class="consultation-avatar" aria-hidden="true">${initial}</span>
        <div class="small flex-grow-1 min-w-0 d-flex align-items-start justify-content-between gap-2 flex-wrap">
          <span class="fw-semibold text-break">${doctor}${edited}</span>
          <span class="text-muted">${dateText}${newBadge}</span>
        </div>
      </div>
      <div class="consultation-comment-text small" style="white-space: pre-wrap;">${text}</div>
    </div>
  `;
}

/**
 * Полная карточка комментария (для встраивания под анализами / в паспорте).
 * @param {object} comment
 * @param {string} [title]
 * @param {{ isNew?: boolean }} [opts]
 */
export function doctorCommentBlockHtml(comment, title, opts = {}) {
  if (!comment) return "";
  const isNew = Boolean(opts.isNew);
  const titleBlock = title
    ? `<div class="small text-secondary fw-semibold mb-2">${escapeHtml(title)}</div>`
    : "";
  return `
    <div class="card app-card consultation-card mb-3 ${isNew ? "consultation-card-new" : ""}">
      <div class="card-body">
        ${titleBlock}
        ${doctorCommentBodyHtml(comment, { ...opts, addTopMargin: false })}
      </div>
    </div>
  `;
}

export function doctorCommentsForMarkerHtml(comments, title) {
  if (!comments?.length) return "";
  const inner = comments.map((c) => doctorCommentBlockHtml(c, title)).join("");
  return `<div class="doctor-comment-marker-backdrop">${inner}</div>`;
}
