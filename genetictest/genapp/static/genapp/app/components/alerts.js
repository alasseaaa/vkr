export function showAlert(type, message) {
  const area = document.getElementById("alert-area");
  if (!area) return;

  const color =
    type === "success"
      ? "alert-success"
      : type === "warning"
        ? "alert-warning"
        : type === "danger"
          ? "alert-danger"
          : type === "info"
            ? "alert-info"
            : "alert-secondary";

  const id = `toast-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const html = `
    <div id="${id}" class="toast align-items-center border-0 ${color}" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Закрыть"></button>
      </div>
    </div>
  `;
  area.insertAdjacentHTML("beforeend", html);
  const el = document.getElementById(id);
  if (el && window.bootstrap?.Toast) {
    const t = new window.bootstrap.Toast(el, { delay: 4200, autohide: true });
    el.addEventListener("hidden.bs.toast", () => el.remove(), { once: true });
    t.show();
  } else if (el) {
    window.setTimeout(() => el.remove(), 4200);
  }
}

export function clearAlert() {
  const area = document.getElementById("alert-area");
  if (area) area.innerHTML = "";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

