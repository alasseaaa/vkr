/**
 * График динамики анализов витаминов (Chart.js, как на дашборде).
 */

function buildVitaminTrendChartPayload(vitaminTests) {
  if (!Array.isArray(vitaminTests) || !vitaminTests.length) return null;
  const byV = new Map();
  for (const t of vitaminTests) {
    const id = t.vitamin;
    if (id == null) continue;
    if (!byV.has(id)) {
      byV.set(id, { name: t.vitamin_name || "—", points: [] });
    }
    const n = parseFloat(String(t.test_value ?? "").replace(",", "."));
    const y = Number.isFinite(n) ? n : null;
    byV.get(id).points.push({ date: t.test_date, y, raw: t });
  }
  for (const v of byV.values()) {
    v.points.sort((a, b) => {
      const da = a.date ? new Date(a.date) : 0;
      const db = b.date ? new Date(b.date) : 0;
      return da - db;
    });
  }
  const entries = [...byV.entries()];
  const with2 = entries.filter(([, v]) => v.points.length >= 2);
  const sortPool = (with2.length ? with2 : entries).sort(
    (a, b) => b[1].points.length - a[1].points.length,
  );
  const [firstKey, firstData] = sortPool[0] || [];
  if (firstData == null) return null;
  if (!with2.length) {
    return {
      needMore: true,
      labels: [],
      datasets: [],
      hintVitaminName: firstData.name,
    };
  }
  const topSeries = sortPool
    .filter(([, d]) => d.points.length >= 2)
    .slice(0, 3)
    .map(([key, d]) => ({ key, name: d.name, points: d.points }));
  if (!topSeries.length) {
    return {
      needMore: true,
      labels: [],
      datasets: [],
      hintVitaminName: firstData.name,
    };
  }
  const dateSet = new Set();
  for (const s of topSeries) {
    for (const p of s.points) {
      if (p.date != null && p.date !== "") dateSet.add(String(p.date).trim());
    }
  }
  if (dateSet.size < 2) {
    return {
      needMore: true,
      labels: [],
      datasets: [],
      hintVitaminName: topSeries[0]?.name || firstData.name,
    };
  }
  const labelRaw = [...dateSet].sort((a, b) => {
    const da = new Date(a);
    const db = new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return String(a).localeCompare(String(b));
    return da - db;
  });
  const labels = labelRaw.map((d) => {
    const x = new Date(d);
    return !Number.isNaN(x.getTime())
      ? x.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
      : String(d);
  });
  const lineColors = [
    { border: "rgba(13, 110, 253, 0.95)", bg: "rgba(13, 110, 253, 0.08)" },
    { border: "rgba(25, 135, 84, 0.95)", bg: "rgba(25, 135, 84, 0.08)" },
    { border: "rgba(13, 202, 240, 0.95)", bg: "rgba(13, 202, 240, 0.08)" },
  ];
  const datasets = topSeries.map((s, i) => {
    const c = lineColors[i % lineColors.length];
    const byDate = new Map(s.points.map((p) => [String(p.date).trim(), p.y]));
    const data = labelRaw.map((ld) => (byDate.has(ld) ? byDate.get(ld) : null));
    return {
      label: s.name,
      data,
      borderColor: c.border,
      backgroundColor: c.bg,
      fill: topSeries.length === 1,
      spanGaps: true,
      tension: 0.25,
      pointRadius: 4,
      pointBackgroundColor: c.border,
    };
  });
  return { needMore: false, labels, datasets, seriesCount: topSeries.length };
}

export function destroyVitaminTrendChart(pageEl) {
  const c = pageEl?._vitaminTestsTrendChart;
  if (c) {
    try {
      c.destroy();
    } catch {
      /* */
    }
    pageEl._vitaminTestsTrendChart = null;
  }
}

export function mountVitaminTrendChart(pageEl, vitaminTests) {
  destroyVitaminTrendChart(pageEl);
  const hintEl = pageEl.querySelector("#vitamin-trend-hint");
  const canvas = pageEl.querySelector("#vitamin-tests-trend-chart");
  if (hintEl) {
    hintEl.classList.remove("d-none");
    hintEl.textContent = "";
  }
  if (!canvas || !window.Chart) {
    return;
  }
  const payload = buildVitaminTrendChartPayload(vitaminTests);
  if (hintEl) {
    if (!vitaminTests?.length) {
      hintEl.classList.add("d-none");
    } else if (payload?.needMore) {
      const name = payload.hintVitaminName ? ` («${payload.hintVitaminName}»)` : "";
      hintEl.textContent = `Чтобы увидеть график, добавьте второй анализ по тому же витамину${name} на другую дату.`;
    } else {
      hintEl.classList.add("d-none");
    }
  }
  if (!payload || payload.needMore || !payload.labels?.length || !payload.datasets?.length) {
    return;
  }
  const ctx = canvas.getContext("2d");
  pageEl._vitaminTestsTrendChart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: payload.labels,
      datasets: payload.datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: (payload.seriesCount || 0) > 1, position: "top" } },
      scales: {
        y: { beginAtZero: false },
        x: { display: true },
      },
    },
  });
}
