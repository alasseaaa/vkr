const TABS = [
  { key: "articles", label: "Статьи", load: () => import("./articles.js?v=2"), route: { name: "articles" } },
  { key: "myth", label: "Миф или правда?", load: () => import("./mythTruth.js?v=2"), route: { name: "myth-truth" } },
  { key: "symptoms", label: "Тест по симптомам", load: () => import("./symptomTest.js?v=8"), route: { name: "symptom-test" } },
];

function tabNavBtn(tab, active) {
  return `<button class="nav-link ${active ? "active" : ""}" id="materials-tab-${tab.key}" data-bs-toggle="tab" data-bs-target="#materials-pane-${tab.key}" type="button" role="tab">${tab.label}</button>`;
}

export async function render(pageEl, ctx) {
  const route = ctx?.route || {};
  const activeKey = TABS.some((t) => t.key === route.tab) ? route.tab : "articles";
  pageEl.innerHTML = `
    <div class="app-page">
      <div class="card app-card border-0 shadow-sm">
        <div class="card-body">
          <h1 class="app-page-title h4 mb-2">Материалы</h1>
          <ul class="nav nav-tabs mb-3" role="tablist">
            ${TABS.map((t) => `<li class="nav-item" role="presentation">${tabNavBtn(t, t.key === activeKey)}</li>`).join("")}
          </ul>
          <div class="tab-content">
            ${TABS.map((t) => `<div class="tab-pane fade ${t.key === activeKey ? "show active" : ""}" id="materials-pane-${t.key}" role="tabpanel"><div class="small text-muted py-2">Загрузка…</div></div>`).join("")}
          </div>
        </div>
      </div>
    </div>`;

  const loaded = new Set();
  const renderTab = async (tabKey) => {
    const tab = TABS.find((x) => x.key === tabKey);
    if (!tab || loaded.has(tabKey)) return;
    const pane = pageEl.querySelector(`#materials-pane-${tabKey}`);
    if (!pane) return;
    const mod = await tab.load();
    await mod.render(pane, { ...ctx, route: tab.route });
    loaded.add(tabKey);
  };

  await renderTab(activeKey);
  const navButtons = pageEl.querySelectorAll('button[data-bs-toggle="tab"]');
  navButtons.forEach((btn) => {
    btn.addEventListener("shown.bs.tab", (ev) => {
      const target = ev?.target?.getAttribute("data-bs-target") || "";
      const key = target.replace("#materials-pane-", "");
      renderTab(key);
      window.history.replaceState({}, "", `#/materials?tab=${encodeURIComponent(key)}`);
    });
  });
}

