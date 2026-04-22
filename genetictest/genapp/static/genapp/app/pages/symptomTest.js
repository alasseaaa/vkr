import { getAuth } from "../services/auth.js";
import {
  SYMPTOM_ITEMS,
  buildGeneScoreMap,
  buildVitaminScoreMap,
} from "../data/symptomTestMap.js";

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
    return `
      <div class="card border-0 shadow-sm mb-4" style="border-left:4px solid var(--bs-info)!important">
        <div class="card-body">
          <h2 class="h5 mb-3">Что сдать по результатам (ориентир)</h2>
          <p class="text-muted small mb-3">Не диагноз, а план дискуссии с врачом и сопоставление с вашим справочником. Гены сдаются в виде генетического / SNP-анализа, витамины и микроэлементы — лабораторно.</p>
          <div class="row g-3">
            <div class="col-md-6">
              <div class="fw-semibold mb-2"><i class="bi bi-dna me-1"></i> Гены (по приоритету релевантности)</div>
              <ol class="small ps-3 mb-0">
                ${
                  rows.length
                    ? rows
                        .map(
                          (r) => `
                    <li class="mb-2">
                      <strong>${escapeHtml(r.g.symbol)}</strong>
                      ${r.g.rs_id ? ` <span class="text-muted">(${escapeHtml(r.g.rs_id)})</span>` : ""}
                      <br/><span class="text-muted">${escapeHtml(r.g.full_name || "")}</span>
                    </li>`,
                        )
                        .join("")
                    : `<li class="text-muted">По отмеченным пунктам в каталоге нет совпадений — уточните симптомы.</li>`
                }
              </ol>
            </div>
            <div class="col-md-6">
              <div class="fw-semibold mb-2"><i class="bi bi-droplet me-1"></i> Анализы: витамины и вещества</div>
              <ol class="small ps-3 mb-0">
                ${
                  vitRows.length
                    ? vitRows
                        .map(
                          (x) => `
                    <li class="mb-2">
                      <strong>${escapeHtml(x.v.name)}</strong>
                      <span class="text-muted"> · совпадений: ${x.score}</span>
                    </li>`,
                        )
                        .join("")
                    : `<li class="text-muted">Нет совпадений по справочнику — обсудите состав панели с врачом.</li>`
                }
              </ol>
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-4">
            <a class="btn btn-primary" href="#/genotypes"><i class="bi bi-dna me-1"></i> Внести генотипы</a>
            <a class="btn btn-outline-primary" href="#/vitamin-tests"><i class="bi bi-droplet me-1"></i> Анализы витаминов</a>
            <a class="btn btn-outline-secondary" href="#/recommendations">Рекомендации</a>
            <button type="button" class="btn btn-outline-dark" id="st-retake">Изменить симптомы</button>
          </div>
        </div>
      </div>
      <p class="text-muted small mb-0">При тревожных или острых симптомах сначала обратитесь к врачу, а не к самообследованию в интернете.</p>
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

    const checks = SYMPTOM_ITEMS.map(
      (s) => `
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" name="st" value="${s.id}" id="st-${s.id}" ${
            selected.has(s.id) ? "checked" : ""
          } />
          <label class="form-check-label" for="st-${s.id}">${escapeHtml(s.label)}</label>
        </div>`,
    ).join("");

    root.innerHTML = `
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h1 class="app-page-title h3 mb-1">Тест по симптомам</h1>
          <p class="text-muted small mb-0">Отметьте, что вас <strong>регулярно</strong> беспокоит. Мы сопоставим ответы со <strong>словарём генов</strong> и <strong>анализов витаминов/микроэлементов</strong> в системе (не весь рынок лабораторий — только то, что есть в каталоге).</p>
        </div>
      </div>
      <div class="card shadow-sm mb-3">
        <div class="card-body p-3 p-md-4">
          <div class="fw-semibold mb-2">Симптомы и сигналы</div>
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
