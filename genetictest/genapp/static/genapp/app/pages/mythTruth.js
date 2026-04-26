function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeExternalUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url, window.location.origin);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* ignore */
  }
  return null;
}

function labelAnswer(key) {
  if (key === "myth") return "Миф";
  if (key === "truth") return "Правда";
  return key;
}

export async function render(pageEl, { api, showAlert }) {
  pageEl.innerHTML = `<div class="app-page"><p class="text-muted">Загрузка теста…</p></div>`;

  let questions = [];
  try {
    questions = await api.public.listMythTruthQuestions();
  } catch (e) {
    pageEl.innerHTML = `<div class="app-page"><div class="alert alert-danger">${escapeHtml(e.message || "Ошибка")}</div></div>`;
    return;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    pageEl.innerHTML = `
      <div class="app-page">
        <h1 class="app-page-title h3 mb-3">Миф или правда?</h1>
        <div class="alert alert-light border">Вопросы пока не добавлены. Загляните позже или обратитесь к администратору.</div>
        <a href="#/articles" class="btn btn-outline-primary btn-sm">К статьям</a>
      </div>`;
    return;
  }

  const answers = {};
  let step = 0;
  let results = null;

  const root = document.createElement("div");
  root.className = "app-page";
  pageEl.innerHTML = "";
  pageEl.appendChild(root);

  const paint = () => {
    if (results) {
      const pct = Math.round((results.score / results.total) * 100);
      root.innerHTML = `
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h1 class="app-page-title h3 mb-1">Результат</h1>
            <p class="text-muted small mb-0">Образовательный тест, не медицинское заключение.</p>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="myth-retry">Пройти снова</button>
        </div>
        <div class="card app-card border-0 shadow-sm mb-4">
          <div class="card-body">
            <div class="fs-2 fw-semibold text-primary mb-1">${results.score} из ${results.total}</div>
            <div class="text-muted small mb-0">Верных ответов (${pct}%)</div>
          </div>
        </div>
        <div class="fw-semibold mb-2">Разбор</div>
        <div class="vstack gap-3">
          ${results.items
            .map(
              (it) => `
            <div class="card app-card shadow-sm" style="border-left: 4px solid ${it.correct ? "var(--bs-success)" : "var(--bs-warning)"};">
              <div class="card-body">
                <div class="small text-muted mb-1">Утверждение</div>
                <p class="mb-2">${escapeHtml(it.statement)}</p>
                <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                  <span class="badge ${it.correct ? "bg-success" : "bg-warning text-dark"}">${it.correct ? "Верно" : "Неверно"}</span>
                  <span class="small">Ваш ответ: <strong>${escapeHtml(labelAnswer(it.your_answer))}</strong></span>
                  <span class="small text-muted">Верный вариант: <strong>${escapeHtml(labelAnswer(it.correct_answer))}</strong></span>
                </div>
                <p class="small mb-2" style="white-space: pre-wrap;">${escapeHtml(it.explanation)}</p>
                ${
                  safeExternalUrl(it.source_url)
                    ? `<a href="${escapeHtml(safeExternalUrl(it.source_url))}" class="small" target="_blank" rel="noopener noreferrer">Источник</a>`
                    : ""
                }
              </div>
            </div>`,
            )
            .join("")}
        </div>
        <p class="small text-muted mt-4 mb-0">
          При симптомах или перед изменением режима сна, питания и нагрузок обратитесь к врачу.
        </p>`;
      root.querySelector("#myth-retry")?.addEventListener("click", () => {
        Object.keys(answers).forEach((k) => delete answers[k]);
        step = 0;
        results = null;
        paint();
      });
      return;
    }

    const q = questions[step];
    const n = questions.length;
    const picked = answers[q.id];
    const atEnd = step === n - 1;

    root.innerHTML = `
      <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h1 class="app-page-title h3 mb-1">Миф или правда?</h1>
          <p class="text-muted small mb-0">Образовательный тест. Выберите, насколько утверждение соответствует распространённым научным взглядам.</p>
        </div>
        <a href="#/articles" class="btn btn-outline-secondary btn-sm">К статьям</a>
      </div>
      <div class="alert alert-light border small mb-3">
        Это не диагноз и не индивидуальная рекомендация: формулировки упрощены. Спорные темы лучше обсудить со специалистом.
      </div>
      <div class="text-muted small mb-2">Вопрос ${step + 1} из ${n}</div>
      <div class="progress mb-4" style="height: 4px;">
        <div class="progress-bar bg-primary" style="width: ${Math.round(((step + 1) / n) * 100)}%"></div>
      </div>
      <div class="card app-card border-0 shadow-sm mb-4">
        <div class="card-body p-4">
          <p class="lead mb-0" style="font-size: 1.05rem;">${escapeHtml(q.statement)}</p>
        </div>
      </div>
      <div class="d-flex flex-wrap gap-2 mb-4">
        <button type="button" class="btn btn-lg btn-outline-danger flex-grow-1" data-pick="myth" style="min-width: 140px;">
          <i class="bi bi-x-octagon me-2"></i>Миф
        </button>
        <button type="button" class="btn btn-lg btn-outline-success flex-grow-1" data-pick="truth" style="min-width: 140px;">
          <i class="bi bi-check2-circle me-2"></i>Правда
        </button>
      </div>
      <div class="d-flex flex-wrap justify-content-between gap-2">
        <button type="button" class="btn btn-outline-secondary" id="myth-prev" ${step === 0 ? "disabled" : ""}>Назад</button>
        <button type="button" class="btn btn-primary" id="myth-next" ${picked ? "" : "disabled"}>${atEnd ? "Показать результат" : "Далее"}</button>
      </div>`;

    root.querySelectorAll("[data-pick]").forEach((btn) => {
      const v = btn.getAttribute("data-pick");
      btn.classList.toggle("active", picked === v);
      btn.addEventListener("click", () => {
        answers[q.id] = v;
        paint();
      });
    });

    root.querySelector("#myth-prev")?.addEventListener("click", () => {
      if (step > 0) {
        step -= 1;
        paint();
      }
    });

    root.querySelector("#myth-next")?.addEventListener("click", async () => {
      if (!picked) return;
      if (!atEnd) {
        step += 1;
        paint();
        return;
      }
      const payload = { answers: {} };
      questions.forEach((qq) => {
        payload.answers[String(qq.id)] = answers[qq.id];
      });
      try {
        results = await api.public.submitMythTruth(payload);
        paint();
      } catch (e) {
        showAlert("danger", e.message || "Не удалось проверить ответы");
      }
    });
  };

  paint();
}
