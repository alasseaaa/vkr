import { getAuth, isAuthed } from "../../services/auth.js?v=3";
import { render as renderGenotypes } from "../genotypes.js?v=8";

export async function render(pageEl, { api, showAlert, route }) {
  if (!isAuthed() || getAuth().role !== "nurse") {
    pageEl.innerHTML = `<div class="alert alert-warning">Нужна роль медсестры (группа в админке).</div>`;
    return;
  }
  const pid = route.patientId;
  if (pid == null || !Number.isFinite(Number(pid))) {
    showAlert("danger", "Некорректный id пациента");
    return;
  }
  let pl = `ID ${pid}`;
  try {
    const s = await api.nurse.getPatientSummary(pid);
    if (s?.username) {
      if (s.first_name || s.last_name) {
        pl = [s.last_name, s.first_name].filter(Boolean).join(" ") + ` (@${s.username})`;
      } else {
        pl = `@${s.username}`;
      }
    }
  } catch (e) {
    showAlert("danger", e.message);
    return;
  }
  let pdfTaskUploadId = null;
  const hash = String(window.location.hash || "");
  const qIdx = hash.indexOf("?");
  if (qIdx !== -1) {
    const q = new URLSearchParams(hash.slice(qIdx + 1));
    const ur = q.get("upload");
    if (ur != null && ur !== "") {
      const n = Number(ur);
      if (Number.isFinite(n) && n > 0) pdfTaskUploadId = n;
    }
  }
  await renderGenotypes(pageEl, {
    api,
    showAlert,
    patientId: Number(pid),
    patientLabel: pl,
    backHref: "#/nurse/profile",
    uploadGeneticPdfs: false,
    pdfTaskUploadId,
  });
}
