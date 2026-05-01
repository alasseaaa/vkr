function safe(v) {
  return v === null || v === undefined ? "—" : String(v);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function activityTypeLabel(t) {
  const map = {
    genotype_added: "Генотип",
    vitamin_test_added: "Витамины",
    doctor_comment_published: "Комментарий",
  };
  return map[t] || t;
}

function buildFilterParams(form) {
  const p = {};
  if (form.no_genotypes?.checked) p.no_genotypes = true;
  if (form.no_vitamin_tests?.checked) p.no_vitamin_tests = true;
  if (form.incomplete_profile?.checked) p.incomplete_profile = true;
  const idle = form.inactive_days?.value;
  if (idle) {
    const n = parseInt(idle, 10);
    if (!Number.isNaN(n) && n > 0) p.inactive_days = n;
  }
  return p;
}

function inactiveOptionsHtml(selected) {
  const opts = [
    { v: "", l: "Не фильтровать" },
    { v: "7", l: "7 дней" },
    { v: "14", l: "14 дней" },
    { v: "30", l: "30 дней" },
    { v: "90", l: "90 дней" },
  ];
  const s = selected != null && selected !== "" ? String(selected) : "";
  return opts
    .map((o) => `<option value="${o.v}"${o.v === s ? " selected" : ""}>${o.l}</option>`)
    .join("");
}

export async function render(pageEl, { api, showAlert }) {
  async function show(filterParams) {
    pageEl.innerHTML = `<div class="card"><div class="card-body">Загрузка...</div></div>`;

    try {
      const [patients, activity] = await Promise.all([
        api.doctor.listPatients(filterParams),
        api.doctor.getActivityFeed({ limit: 40 }),
      ]);

      const f = filterParams || {};
      const idleSel = f.inactive_days != null ? String(f.inactive_days) : "";

      pageEl.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h3 class="mb-0">Пациенты</h3>
        <span class="text-muted small">${(patients || []).length} в списке</span>
      </div>

      <div class="card shadow-sm mb-3">
        <div class="card-header py-2 fw-semibold">Лента активности</div>
        <div class="card-body py-2" style="max-height: 280px; overflow-y: auto;">
          ${
            activity?.length
              ? `<ul class="list-group list-group-flush small mb-0">
                  ${activity
                    .map(
                      (e) => `
                    <li class="list-group-item px-0 d-flex flex-wrap gap-2 align-items-baseline border-0 border-bottom">
                      <span class="badge text-bg-light text-dark">${activityTypeLabel(e.type)}</span>
                      <span class="text-muted">${formatDateTime(e.created_at)}</span>
                      <a href="#/doctor/patients/${e.patient_id}" class="fw-semibold text-decoration-none">${safe(
                        e.patient_label,
                      )}</a>
                      <span class="text-body-secondary">${safe(e.title)}${e.detail ? ` — ${safe(e.detail)}` : ""}</span>
                    </li>`,
                    )
                    .join("")}
                </ul>`
              : `<p class="text-muted small mb-0">Пока нет событий по вашим пациентам.</p>`
          }
        </div>
      </div>

      <form class="card shadow-sm mb-3" data-filters>
        <div class="card-body py-3">
          <div class="fw-semibold mb-2">Фильтры</div>
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-auto">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="no_genotypes" id="flt-no-gt"${f.no_genotypes ? " checked" : ""}>
                <label class="form-check-label" for="flt-no-gt">Без генотипов</label>
              </div>
            </div>
            <div class="col-12 col-md-auto">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="no_vitamin_tests" id="flt-no-vt"${f.no_vitamin_tests ? " checked" : ""}>
                <label class="form-check-label" for="flt-no-vt">Без анализов витаминов</label>
              </div>
            </div>
            <div class="col-12 col-md-auto">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="incomplete_profile" id="flt-inc"${f.incomplete_profile ? " checked" : ""}>
                <label class="form-check-label" for="flt-inc">Неполный профиль</label>
              </div>
            </div>
            <div class="col-12 col-md-3">
              <label class="form-label small mb-0">Не заходили</label>
              <select class="form-select form-select-sm" name="inactive_days">${inactiveOptionsHtml(idleSel)}</select>
            </div>
            <div class="col-12 col-md-auto d-flex gap-2">
              <button type="button" class="btn btn-sm btn-primary" data-apply>Применить</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-reset>Сбросить</button>
            </div>
          </div>
        </div>
      </form>

      <div class="card shadow-sm">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover mb-0 align-middle">
              <thead class="table-light">
                <tr>
                  <th>ID</th>
                  <th>Пациент</th>
                  <th>Профиль</th>
                  <th class="text-center">Генотипы</th>
                  <th class="text-center">Анализы</th>
                  <th>Последний вход</th>
                  <th class="text-end">Действия</th>
                </tr>
              </thead>
              <tbody>
                ${
                  patients?.length
                    ? patients
                        .map(
                          (p) => `
                  <tr>
                    <td class="text-muted">${p.id}</td>
                    <td>
                      <div class="fw-semibold">${escapeHtml(p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim())}</div>
                      <div class="text-muted small">@${p.username}</div>
                    </td>
                    <td>
                      <div class="small">Рост: ${safe(p.profile?.height)} см</div>
                      <div class="small">Вес: ${safe(p.profile?.weight)} кг</div>
                      <div class="small">Пол: ${safe(p.profile?.gender)}</div>
                    </td>
                    <td class="text-center">${safe(p.genotypes_count)}</td>
                    <td class="text-center">${safe(p.vitamin_tests_count)}</td>
                    <td class="small text-muted">${formatDateTime(p.last_login)}</td>
                    <td class="text-end">
                      <a class="btn btn-sm btn-outline-primary" href="#/doctor/patients/${p.id}">Открыть</a>
                    </td>
                  </tr>
                `,
                        )
                        .join("")
                    : `<tr><td colspan="7" class="text-center text-muted py-4">Список пуст</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

      const form = pageEl.querySelector("form[data-filters]");
      pageEl.querySelector("[data-apply]")?.addEventListener("click", () => {
        show(buildFilterParams(form));
      });
      pageEl.querySelector("[data-reset]")?.addEventListener("click", () => {
        show({});
      });
    } catch (err) {
      showAlert("danger", err.message);
      pageEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  }

  await show({});
}
