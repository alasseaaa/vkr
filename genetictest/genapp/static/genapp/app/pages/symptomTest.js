import { getAuth } from "../services/auth.js";
// Важно: ?v= сбрасывает кэш модуля карты (без него меняется только этот файл, а старая map остаётся).
import { SYMPTOM_ITEMS, buildGeneScoreMap, buildVitaminScoreMap } from "../data/symptomTestMap.js?v=1";

/** Подпись категории гена (тот же ключ, что в API / модели), только для бейджа. */
const GENE_CATEGORY_RU = {
  metabolism: "Метаболизм",
  vitamins: "Витамины",
  sport: "Спорт",
  nutrition: "Питание",
  skincare: "Кожа и старение",
  hair: "Волосы",
  longevity: "Долголетие",
  circadian: "Циркадные ритмы",
  detox: "Детоксикация",
  hormones: "Гормоны",
  bones: "Кости и суставы",
  immunity: "Иммунитет",
};
function categoryBadgeLabel(key) {
  if (!key) return "";
  return GENE_CATEGORY_RU[key] || key;
}

/** { group, labels[] } — сводка отмеченных пунктов (локально, не импорт из data/*). */
function getSelectedSymptomGroups(selectedIds) {
  const map = new Map();
  for (const item of SYMPTOM_ITEMS) {
    if (!selectedIds.has(item.id)) continue;
    const g = item.group || "Другое";
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(item.label);
  }
  return Array.from(map.entries()).map(([group, labels]) => ({ group, labels }));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function render(pageEl, { api, showAlert, auth: authInCtx }) {
  const auth = authInCtx || getAuth();
  const role = String(auth?.role ?? "").toLowerCase();

  if (role === "doctor") {
    pageEl.innerHTML = `
      <div class="app-page">
        <h1 class="h3 mb-3">Тест по симптомам</h1>
        <div class="alert alert-info border-0">Этот инструмент рассчитан на пациентов и администраторов. Войдите с учётной записи пациента, чтобы увидеть подбор по справочнику генов и витаминов.</div>
        <a href="#/doctor/patients" class="btn btn-outline-primary">К пациентам</a>
      </div>`;
    return;
  }

  pageEl.innerHTML = `<div class="app-page"><p class="text-muted">Загрузка справочников…</p></div>`;

  let genes = [];
  let vitamins = [];
  try {
    [genes, vitamins] = await Promise.all([api.patient.listGeneCatalog(), api.patient.listVitaminCatalog()]);
  } catch (e) {
    pageEl.innerHTML = `<div class="app-page"><div class="alert alert-danger">${escapeHtml(e.message || "Ошибка")}</div></div>`;
    return;
  }

  const symbolToGene = new Map((genes || []).map((g) => [g.symbol, g]));
  const selected = new Set();
  let showResults = false;

  const root = document.createElement("div");
  root.className = "app-page";
  pageEl.innerHTML = "";
  pageEl.appendChild(root);

  const renderResults = () => {
    const gmap = buildGeneScoreMap(selected);
    const rows = Array.from(gmap.entries())
      .map(([symbol, score]) => ({ g: symbolToGene.get(symbol), symbol, score }))
      .filter((r) => r.g)
      .sort((a, b) => b.score - a.score);
    const vitRows = buildVitaminScoreMap(vitamins, selected);
    const symptomGroups = getSelectedSymptomGroups(selected);
    const maxVit = 15;
    const vitTrimmed = vitRows.slice(0, maxVit);
    const vitRest = Math.max(0, vitRows.length - maxVit);

    const yourMarksHtml = symptomGroups.length
      ? symptomGroups
          .map(
            (sg) => `
        <div class="mb-2">
          <div class="text-muted text-uppercase" style="font-size:0.7rem;letter-spacing:0.04em">${escapeHtml(sg.group)}</div>
          <ul class="mb-0 ps-3 small">${sg.labels.map((L) => `<li>${escapeHtml(L)}</li>`).join("")}</ul>
        </div>`,
          )
          .join("")
      : `<p class="text-muted small mb-0">Нет отмеченных пунктов.</p>`;

    return `
      <div class="card bg-light border mb-3">
        <div class="card-body py-3">
          <div class="fw-semibold small mb-2">Что вы отметили (сводка)</div>
          ${yourMarksHtml}
        </div>
      </div>
      <div class="card border-0 shadow-sm mb-3" style="border-left:4px solid var(--bs-info)!important">
        <div class="card-body">
          <h2 class="h5 mb-3">Что делать дальше?</h2>
          <p class="text-muted small mb-3">Генетические тесты сдают один раз в жизни по совету врача. Уровень витаминов и микроэлементов проверяют с помощью обычных анализов в лаборатории. Число рядом с показателем - количество совпадений. Если число большое, значит, этот ген «откликнулся» сразу в нескольких сферах (например, и в блоке «Питание», и в блоке «Кожа»). Это лишь подсказка, на что обратить внимание в первую очередь.</p>
          <div class="row g-3">
            <div class="col-md-6">
              <div class="fw-semibold mb-2"><i class="bi bi-dna me-1"></i> Гены в каталоге (сверху вниз — чаще пересекались с отметками)</div>
              <ol class="small ps-3 mb-0">
                ${
                  rows.length
                    ? rows
                        .map(
                          (r) => {
                            const c = r.g.category
                              ? `<span class="badge bg-secondary bg-opacity-25 text-dark border ms-1" style="font-size:0.65rem">${escapeHtml(
                                  categoryBadgeLabel(r.g.category),
                                )}</span>`
                              : "";
                            return `<li class="mb-2">
                      <div class="d-flex flex-wrap align-items-baseline gap-1">
                        <strong>${escapeHtml(r.g.symbol)}</strong> ${c}
                        <span class="text-muted" title="в скольких смысловых пунктах встречалось">· рел. ${r.score}</span>
                      </div>
                      <span class="text-muted d-block" style="font-size:0.8rem">${escapeHtml(r.g.full_name || "")} ${r.g.rs_id ? ` <span class="text-muted">(${escapeHtml(r.g.rs_id)})</span>` : ""}</span>
                    </li>`;
                          },
                        )
                        .join("")
                    : `<li class="text-muted">В справочнике нет таких лейблов — проверьте, что в системе заведены гены (или отметьте меньше узкие пункты).</li>`
                }
              </ol>
            </div>
            <div class="col-md-6">
              <div class="fw-semibold mb-2"><i class="bi bi-droplet me-1"></i> Витамины и вещества из справочника (по «пересечению» с отмеченными темами)</div>
              <ol class="small ps-3 mb-0">
                ${
                  vitTrimmed.length
                    ? vitTrimmed
                        .map(
                          (x) => `
                    <li class="mb-2">
                      <strong>${escapeHtml(x.v.name)}</strong>
                      <span class="text-muted">· совп. тем: ${x.score}</span>
                    </li>`,
                        )
                        .join("")
                    : `<li class="text-muted">По подстрокам в названиях нет совпадения — в каталоге нет сочетания, или сузьте отмеченные сигналы; конкретная панель — у врача/лаборатории.</li>`
                }
                ${vitRest > 0 ? `<li class="text-muted">…и ещё ${vitRest} веществ(а) в справочнике, можно листать аналогично</li>` : ""}
              </ol>
            </div>
          </div>
          <div class="alert alert-info small border-0 mt-3 mb-0" role="note">
            <strong>Дальнейшие шаги.</strong> Внести реальные <a href="#/genotypes" class="alert-link">генотипы</a> и <a href="#/vitamin-tests" class="alert-link">анализы</a> в кабинет — тогда <a href="#/recommendations" class="alert-link">рекомендации</a> и паспорт станут персональны. Сужать или расширять панель анализов имеет смысл только вместе с врачом, который знает клиническую картину.
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <a class="btn btn-primary" href="#/genotypes"><i class="bi bi-dna me-1"></i> К генотипам</a>
            <a class="btn btn-outline-primary" href="#/vitamin-tests"><i class="bi bi-droplet me-1"></i> К анализам витаминов</a>
            <a class="btn btn-outline-secondary" href="#/recommendations">К рекомендациям</a>
            <button type="button" class="btn btn-outline-dark" id="st-retake">Назад к вопросам</button>
          </div>
        </div>
      </div>
      <p class="text-muted small mb-0">Острые или быстро нарастающие симптомы — в скорую или к врачу лично, тест в приложении на это не заменяет.</p>
    `;
  };

  const paint = () => {
    if (showResults) {
      root.innerHTML = `
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h1 class="app-page-title h3 mb-1">Рекомендация по анализам</h1>
            <p class="text-muted small mb-0">Сопоставлено с вашим справочником: ${genes.length} генов, ${vitamins.length} веществ в каталоге.</p>
          </div>
        </div>
        ${renderResults()}`;
      root.querySelector("#st-retake")?.addEventListener("click", () => {
        showResults = false;
        paint();
      });
      return;
    }

    const order = [];
    const byGroup = new Map();
    for (const s of SYMPTOM_ITEMS) {
      const g = s.group || "Прочее";
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g).push(s);
    }
    const checks = order
      .map(
        (g, idx) => `
      <h6 class="text-secondary text-uppercase small mb-2 st-symptom-g ${idx === 0 ? "st-symptom-g--first" : "mt-3"}" style="font-size:0.72rem;letter-spacing:0.05em">${escapeHtml(
        g,
      )}</h6>
      ${(byGroup.get(g) || [])
        .map(
          (s) => `
        <div class="form-check mb-2">
          <input class="form-check-input" type="checkbox" name="st" value="${s.id}" id="st-${s.id}" ${
            selected.has(s.id) ? "checked" : ""
          } />
          <label class="form-check-label small" for="st-${s.id}">${escapeHtml(s.label)}</label>
        </div>`,
        )
        .join("")}`,
      )
      .join("");
    const firstStyle = `<style>
      h6.st-symptom-g--first { margin-top:0 !important; }
    </style>`;

    root.innerHTML = `${firstStyle}
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h1 class="app-page-title h3 mb-1">Тест по симптомам</h1>
          <p class="text-muted small mb-0">Каждая строчка — <strong>один тип сигнала</strong> (без «всё сразу»). Отмечайте, что <strong>длится и повторяется</strong> у вас. Результат — сопоставление с заведёнными в сервисе <strong>генами</strong> и <strong>веществами из аналитики</strong>, плюс подсказка, куда в кабинете внести данные.</p>
        </div>
      </div>
      <div class="card shadow-sm mb-3">
        <div class="card-body p-3 p-md-4">
          <div class="fw-semibold mb-1">Сигналы по группам</div>
          <p class="text-muted small mb-2">Снимите чекбоксы, если сигнал вам «не подходит» — тогда в учёт не пойдёт.</p>
          ${checks}
        </div>
        <div class="card-footer bg-light d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-primary" id="st-submit" ${selected.size === 0 ? "disabled" : ""}>Показать, на что сдать анализ</button>
          <button type="button" class="btn btn-link text-muted" id="st-all">отметить всё</button>
          <button type="button" class="btn btn-link text-muted" id="st-none">снять всё</button>
        </div>
      </div>
      <p class="text-muted small">Нажимая кнопку, вы соглашаетесь, что подбор носит информационный характер.</p>
    `;

    root.querySelectorAll('input[name="st"]').forEach((el) => {
      el.addEventListener("change", () => {
        if (el.checked) selected.add(el.value);
        else selected.delete(el.value);
        const btn = root.querySelector("#st-submit");
        if (btn) btn.disabled = selected.size === 0;
      });
    });

    root.querySelector("#st-all")?.addEventListener("click", () => {
      SYMPTOM_ITEMS.forEach((s) => selected.add(s.id));
      paint();
    });
    root.querySelector("#st-none")?.addEventListener("click", () => {
      selected.clear();
      paint();
    });

    root.querySelector("#st-submit")?.addEventListener("click", () => {
      if (selected.size === 0) {
        showAlert("warning", "Отметьте хотя бы один пункт.");
        return;
      }
      showResults = true;
      paint();
    });
  };

  paint();
}
