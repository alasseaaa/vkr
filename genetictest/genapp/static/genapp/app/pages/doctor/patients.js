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
  const fio = (form.fio_query?.value || "").trim();
  if (fio) p.q = fio;
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

function parseStateFromUrl() {
  const url = new URL(window.location.href);
  const q = url.searchParams;
  return {
    filters: {
      q: q.get("q") || "",
      no_genotypes: q.get("no_genotypes") === "1",
      no_vitamin_tests: q.get("no_vitamin_tests") === "1",
      incomplete_profile: q.get("incomplete_profile") === "1",
      inactive_days: q.get("inactive_days") || "",
    },
    page: Math.max(1, Number(q.get("page")) || 1),
    pageSize: [5, 20, 50, 100].includes(Number(q.get("pageSize"))) ? Number(q.get("pageSize")) : 5,
    orderBy: q.get("order_by") || "",
  };
}

function writeStateToUrl(state) {
  const url = new URL(window.location.href);
  const q = new URLSearchParams();
  if (state.filters.q) q.set("q", String(state.filters.q));
  if (state.filters.no_genotypes) q.set("no_genotypes", "1");
  if (state.filters.no_vitamin_tests) q.set("no_vitamin_tests", "1");
  if (state.filters.incomplete_profile) q.set("incomplete_profile", "1");
  if (state.filters.inactive_days) q.set("inactive_days", String(state.filters.inactive_days));
  if (state.page > 1) q.set("page", String(state.page));
  if (state.pageSize !== 5) q.set("pageSize", String(state.pageSize));
  if (state.orderBy) q.set("order_by", state.orderBy);
  url.search = q.toString();
  window.history.pushState({}, "", url);
}

function orderArrow(current, key) {
  if (current === key) return " ▲";
  if (current === `-${key}`) return " ▼";
  return "";
}

function nextOrder(current, key) {
  if (current === key) return `-${key}`;
  if (current === `-${key}`) return "";
  return key;
}

const DOCTOR_PATIENTS_ACTIVITY_SEEN_KEY = "doctor_patients_activity_seen_at";

function readSeenTs(key) {
  try {
    const raw = localStorage.getItem(key);
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function writeSeenTs(key, ts) {
  try {
    localStorage.setItem(key, String(ts));
  } catch {
    /* */
  }
}

export async function render(pageEl, { api, showAlert }) {
  const initial = parseStateFromUrl();
  const state = {
    filters: initial.filters,
    page: initial.page,
    pageSize: initial.pageSize,
    orderBy: initial.orderBy,
    total: 0,
    pages: 1,
    loadingPatients: false,
    loadingActivity: false,
    activityError: "",
    activityItems: [],
    activityDays: 30,
    activityVisible: 10,
    activityLastSeenTs: readSeenTs(DOCTOR_PATIENTS_ACTIVITY_SEEN_KEY),
  };

  const isDesktop = () => window.matchMedia("(min-width: 992px)").matches;

  const renderShell = (patients) => {
    const f = state.filters || {};
    const idleSel = f.inactive_days != null ? String(f.inactive_days) : "";
    const sortHead = (label, key) =>
      isDesktop()
        ? `<button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-dark fw-semibold" data-sort="${key}">${label}${orderArrow(state.orderBy, key)}</button>`
        : `<span class="fw-semibold">${label}</span>`;

    pageEl.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h3 class="mb-0">Пациенты</h3>
        <span class="text-muted small">${state.total} в списке</span>
      </div>

      <div class="card shadow-sm mb-3">
        <div class="card-header py-2 fw-semibold">Лента активности</div>
        <div class="card-body py-2 border-bottom">
          <div class="d-flex align-items-center gap-2 small">
            <span class="text-muted">Период:</span>
            <select class="form-select form-select-sm" style="width: 170px" data-activity-days>
              <option value="7" ${state.activityDays === 7 ? "selected" : ""}>за 7 дней</option>
              <option value="30" ${state.activityDays === 30 ? "selected" : ""}>за 30 дней</option>
              <option value="90" ${state.activityDays === 90 ? "selected" : ""}>за 90 дней</option>
              <option value="0" ${state.activityDays === 0 ? "selected" : ""}>за всё время</option>
            </select>
          </div>
        </div>
        <div class="card-body py-2" id="doctor-activity-mount" style="max-height: 220px; overflow-y: auto;">
          <div class="text-muted small">Загрузка…</div>
        </div>
      </div>

      <form class="card shadow-sm mb-3" data-filters>
        <div class="card-body py-3">
          <div class="fw-semibold mb-2">Фильтры</div>
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-4">
              <label class="form-label small mb-0">Поиск по ФИО</label>
              <input type="search" class="form-control form-control-sm" name="fio_query" placeholder="Например: Иванов Иван" value="${escapeHtml(f.q || "")}">
            </div>
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
              <div class="input-group input-group-sm">
                <input type="number" min="1" class="form-control" name="inactive_days" placeholder="дней" value="${escapeHtml(idleSel)}">
                <button type="button" class="btn btn-outline-secondary" title="Очистить" data-clear-idle>✕</button>
              </div>
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
                  <th>${sortHead("ID", "id")}</th>
                  <th>${sortHead("Пациент", "full_name")}</th>
                  <th>Профиль</th>
                  <th class="text-center">${sortHead("Генотипы", "genotypes_count")}</th>
                  <th class="text-center">${sortHead("Анализы", "vitamin_tests_count")}</th>
                  <th>${sortHead("Последний вход", "last_login")}</th>
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
        <div class="card-footer bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2 small">
            <span>Показывать на странице:</span>
            <select class="form-select form-select-sm" style="width: 90px" data-page-size>
              <option value="5" ${state.pageSize === 5 ? "selected" : ""}>5</option>
              <option value="20" ${state.pageSize === 20 ? "selected" : ""}>20</option>
              <option value="50" ${state.pageSize === 50 ? "selected" : ""}>50</option>
              <option value="100" ${state.pageSize === 100 ? "selected" : ""}>100</option>
            </select>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-prev ${state.page <= 1 ? "disabled" : ""}>&lt; Назад</button>
            <span class="small text-muted">Страница ${state.page} из ${state.pages}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-next ${state.page >= state.pages ? "disabled" : ""}>Вперед &gt;</button>
          </div>
        </div>
      </div>
    `;
  };

  const renderActivity = () => {
    const mount = pageEl.querySelector("#doctor-activity-mount");
    if (!mount) return;
    if (state.loadingActivity) {
      mount.innerHTML = `<div class="d-flex align-items-center gap-2 text-muted small"><div class="spinner-border spinner-border-sm" role="status"></div>Загрузка ленты…</div>`;
      return;
    }
    if (state.activityError) {
      mount.innerHTML = `<div class="alert alert-warning py-2 mb-0 small d-flex align-items-center justify-content-between gap-2"><span>${escapeHtml(state.activityError)}</span><button class="btn btn-sm btn-outline-secondary" data-retry-activity>Повторить</button></div>`;
      mount.querySelector("[data-retry-activity]")?.addEventListener("click", () => loadActivity());
      return;
    }
    const now = Date.now();
    const cutoff =
      state.activityDays > 0 ? now - state.activityDays * 24 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY;
    const filtered = (state.activityItems || []).filter((e) => {
      if (e?.type === "doctor_comment_published") return false;
      const t = new Date(e.created_at).getTime();
      if (!Number.isFinite(t)) return state.activityDays === 0;
      return t >= cutoff;
    });
    const visible = filtered.slice(0, state.activityVisible);
    const hasMore = filtered.length > visible.length;
    const newCount = filtered.filter((e) => {
      const t = new Date(e.created_at).getTime();
      return Number.isFinite(t) && t > state.activityLastSeenTs;
    }).length;
    mount.innerHTML = visible.length
      ? `${newCount > 0 ? `<div class="mb-2"><span class="badge text-bg-warning">Новых событий: ${newCount}</span></div>` : ""}
        <ul class="list-group list-group-flush small mb-2">
          ${visible
            .map(
              (e) => `
            <li class="list-group-item px-0 d-flex flex-wrap gap-2 align-items-baseline border-0 border-bottom">
              <span class="badge text-bg-light text-dark">${activityTypeLabel(e.type)}</span>
              <span class="text-muted">${formatDateTime(e.created_at)}</span>
              <a href="#/doctor/patients/${e.patient_id}" class="fw-semibold text-decoration-none">${safe(e.patient_label)}</a>
              ${
                (() => {
                  const t = new Date(e.created_at).getTime();
                  return Number.isFinite(t) && t > state.activityLastSeenTs
                    ? '<span class="badge text-bg-warning">new</span>'
                    : "";
                })()
              }
              <span class="text-body-secondary">${safe(e.title)}${e.detail ? ` — ${safe(e.detail)}` : ""}</span>
            </li>`,
            )
            .join("")}
        </ul>
        ${hasMore ? `<div class="text-center"><button class="btn btn-sm btn-outline-secondary" data-activity-more>Показать ещё</button></div>` : ""}`
      : `<p class="text-muted small mb-0">За выбранный период событий нет.</p>`;
    mount.querySelector("[data-activity-more]")?.addEventListener("click", () => {
      state.activityVisible += 10;
      renderActivity();
    });
  };

  const bindUi = () => {
    const form = pageEl.querySelector("form[data-filters]");
    pageEl.querySelector("[data-apply]")?.addEventListener("click", () => {
      state.filters = buildFilterParams(form);
      state.page = 1;
      writeStateToUrl(state);
      loadPatients();
    });
    pageEl.querySelector("[data-reset]")?.addEventListener("click", () => {
      state.filters = { q: "", no_genotypes: false, no_vitamin_tests: false, incomplete_profile: false, inactive_days: "" };
      state.page = 1;
      state.orderBy = "";
      writeStateToUrl(state);
      loadPatients();
    });
    pageEl.querySelector("[data-clear-idle]")?.addEventListener("click", () => {
      if (form?.inactive_days) form.inactive_days.value = "";
    });
    pageEl.querySelector("[data-prev]")?.addEventListener("click", () => {
      if (state.page <= 1) return;
      state.page -= 1;
      writeStateToUrl(state);
      loadPatients();
    });
    pageEl.querySelector("[data-next]")?.addEventListener("click", () => {
      if (state.page >= state.pages) return;
      state.page += 1;
      writeStateToUrl(state);
      loadPatients();
    });
    pageEl.querySelector("[data-page-size]")?.addEventListener("change", (e) => {
      state.pageSize = Math.max(5, Number(e.target.value) || 5);
      state.page = 1;
      writeStateToUrl(state);
      loadPatients();
    });
    pageEl.querySelector("[data-activity-days]")?.addEventListener("change", (e) => {
      state.activityDays = Number(e.target.value) || 0;
      state.activityVisible = 10;
      renderActivity();
    });
    if (isDesktop()) {
      pageEl.querySelectorAll("[data-sort]").forEach((el) =>
        el.addEventListener("click", () => {
          const key = el.getAttribute("data-sort");
          state.orderBy = nextOrder(state.orderBy, key);
          state.page = 1;
          writeStateToUrl(state);
          loadPatients();
        }),
      );
    }
  };

  const loadActivity = async () => {
    state.loadingActivity = true;
    state.activityError = "";
    renderActivity();
    try {
      const activity = await api.doctor.getActivityFeed({ limit: 40 });
      state.activityItems = Array.isArray(activity) ? activity : [];
    } catch (err) {
      state.activityItems = [];
      state.activityError = err?.message || "Не удалось загрузить ленту активности.";
    } finally {
      state.loadingActivity = false;
      renderActivity();
      writeSeenTs(DOCTOR_PATIENTS_ACTIVITY_SEEN_KEY, Date.now());
    }
  };

  const loadPatients = async () => {
    state.loadingPatients = true;
    pageEl.innerHTML = `<div class="card"><div class="card-body d-flex align-items-center gap-2"><div class="spinner-border spinner-border-sm" role="status"></div>Загрузка пациентов…</div></div>`;
    try {
      const params = {
        ...state.filters,
        page: state.page,
        pageSize: Math.max(5, state.pageSize),
        page_size: Math.max(5, state.pageSize),
      };
      if (state.orderBy) params.order_by = state.orderBy;
      const data = await api.doctor.listPatients(params);
      const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
      const count = Array.isArray(data) ? list.length : Number(data?.count) || list.length;
      state.total = count;
      state.pages = Math.max(1, Math.ceil(count / state.pageSize));
      if (state.page > state.pages) {
        state.page = state.pages;
      }
      renderShell(list);
      bindUi();
      renderActivity();
      loadActivity();
    } catch (err) {
      showAlert("danger", err.message);
      pageEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    } finally {
      state.loadingPatients = false;
    }
  };

  await loadPatients();
}
