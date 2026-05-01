const TABS = [
  {
    key: "tests",
    label: "Анализы",
    load: () => import("./vitaminTests.js?v=15"),
  },
  {
    key: "intake",
    label: "Приём добавок",
    load: () => import("./vitaminIntake.js?v=3"),
  },
];

function tabNavBtn(tab, active) {
  return `<button class="nav-link ${active ? "active" : ""}" id="vitamins-tab-${tab.key}" data-bs-toggle="tab" data-bs-target="#vitamins-pane-${tab.key}" type="button" role="tab">${tab.label}</button>`;
}

export async function render(pageEl, ctx) {
  const route = ctx?.route || {};
  const activeKey = TABS.some((t) => t.key === route.tab) ? route.tab : "tests";
  pageEl.innerHTML = `
    <div class="app-page">
      <div class="card app-card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
            <h1 class="app-page-title h4 mb-0">Витамины</h1>
          </div>
          <ul class="nav nav-tabs mb-3" role="tablist">
            ${TABS.map((t) => `<li class="nav-item" role="presentation">${tabNavBtn(t, t.key === activeKey)}</li>`).join("")}
          </ul>
          <div class="tab-content">
            ${TABS.map((t) => `<div class="tab-pane fade ${t.key === activeKey ? "show active" : ""}" id="vitamins-pane-${t.key}" role="tabpanel"><div class="small text-muted py-2">Загрузка…</div></div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;

  const loaded = new Set();
  const renderTab = async (tabKey) => {
    const tab = TABS.find((x) => x.key === tabKey);
    if (!tab || loaded.has(tabKey)) return;
    const pane = pageEl.querySelector(`#vitamins-pane-${tabKey}`);
    if (!pane) return;
    const mod = await tab.load();
    await mod.render(pane, { ...ctx, route });
    loaded.add(tabKey);
  };

  await renderTab(activeKey);
  const navButtons = pageEl.querySelectorAll('button[data-bs-toggle="tab"]');
  navButtons.forEach((btn) => {
    btn.addEventListener("shown.bs.tab", (ev) => {
      const target = ev?.target?.getAttribute("data-bs-target") || "";
      const key = target.replace("#vitamins-pane-", "");
      renderTab(key);
      window.history.replaceState({}, "", `#/vitamins?tab=${encodeURIComponent(key)}`);
    });
  });
}
