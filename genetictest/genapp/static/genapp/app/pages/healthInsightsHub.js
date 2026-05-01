function tabBtn(href, label, active) {
  return `<a href="#${href}" class="btn btn-sm ${active ? "btn-primary" : "btn-outline-primary"}">${label}</a>`;
}

const TABS = [
  { key: "vitamins", label: "Анализы витаминов", href: "/vitamins?tab=tests" },
  { key: "recommendations", label: "Рекомендации", href: "/recommendations" },
];

export async function render(pageEl, { route }) {
  const activeKey = TABS.some((t) => t.key === route?.tab) ? route.tab : "vitamins";
  const active = TABS.find((t) => t.key === activeKey) || TABS[0];
  pageEl.innerHTML = `
    <div class="app-page">
      <div class="card app-card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h1 class="app-page-title h4 mb-0">Анализы и рекомендации</h1>
            <div class="d-flex flex-wrap gap-2">
              ${TABS.map((t) => tabBtn(`/health-insights/${t.key}`, t.label, t.key === activeKey)).join("")}
            </div>
          </div>
          <p class="text-muted small mb-3">Единая точка входа к результатам и плану действий.</p>
          <div class="border rounded-3 p-3 bg-light">
            <div class="fw-semibold mb-1">${active.label}</div>
            <div class="small text-muted mb-2">Используется текущая рабочая страница этого раздела.</div>
            <a class="btn btn-primary btn-sm" href="#${active.href}">Открыть раздел</a>
          </div>
        </div>
      </div>
    </div>`;
}

