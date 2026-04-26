/**
 * Симптомы → кандидаты: ген (symbol) и подстроки в названиях витаминов из каталога.
 * Каждый пункт — одна смысловая тема (без «смешанных» формулировок).
 * Генов, которых нет в БД, в итоге не будет.
 */
export const SYMPTOM_ITEMS = [
  { id: "appetite_strong", group: "Вес, аппетит, сахар", label: "Сильный, частый голод, слабое чувство насыщения", geneSymbols: ["FTO", "TCF7L2", "APOE"], vitaminSubstrings: ["магн", "цинк", "b6", "b 6", "k2"] },
  { id: "weight_gain", group: "Вес, аппетит, сахар", label: "Склонность к набору веса при обычном питании", geneSymbols: ["FTO", "TCF7L2"], vitaminSubstrings: ["магн", "b6", "b 6", "цинк", "b12", "b 12"] },
  { id: "sugar_dip", group: "Вес, аппетит, сахар", label: "Слабость и дрожь, если перерыв в еде дольше 4–5 часов", geneSymbols: ["TCF7L2", "APOE"], vitaminSubstrings: ["магн", "b6", "b 6", "b12", "b 12", "b9", "фолат"] },
  { id: "sugar_mood", group: "Вес, аппетит, сахар", label: "Скачок раздражительности и сонливости сразу после сладкого/быстрых углеводов", geneSymbols: ["TCF7L2", "FTO", "APOE"], vitaminSubstrings: ["k2", "b6", "b 6", "магн", "b12", "b 12"] },
  { id: "bloating_meal", group: "Пищеварение", label: "Систематическое вздутие сразу после еды, без острой боли, только тяжесть в животе", geneSymbols: ["TCF7L2", "APOE"], vitaminSubstrings: ["магн", "b6", "b 6", "d3", "k2"] },
  { id: "skin_dry", group: "Кожа", label: "Сухая, стянутая кожа, шелушение (крем снимает не весь сухой слой)", geneSymbols: ["VDR", "COL1A1", "MMP1"], vitaminSubstrings: ["d3", "d 3", "витамин d", "аскорб", "c ", "c)", "биот", "кремн"] },
  { id: "photoaging", group: "Кожа", label: "Сетчатые и глубокие морщины, кожа лица заметно «стареет» от солнца", geneSymbols: ["MMP1", "MC1R", "VDR", "GPX1"], vitaminSubstrings: ["ликоп", "ликопин", "астакс", "аскорб", "c ", "q10", "убих", "кремн"] },
  { id: "burn_easy", group: "Кожа", label: "Сильно краснеете и «горите» на солнце раньше окружающих", geneSymbols: ["MC1R", "TYR", "VDR"], vitaminSubstrings: ["ликоп", "астакс", "аскорб", "c ", "d3", "d 3"] },
  { id: "freckles", group: "Кожа", label: "Сильно выраженные веснушки и неравномерный тон, даже вне загара", geneSymbols: ["MC1R", "TYR", "MMP1"], vitaminSubstrings: ["ликоп", "астакс", "цинк", "аскорб", "c "] },
  { id: "hair_loss", group: "Волосы, ногти", label: "Выпадение волос, уменьшение объёма, без явных плешей (диффузно)", geneSymbols: ["KRT81", "EDAR", "TYR"], vitaminSubstrings: ["биот", "b7", "b 7", "цинк", "селен", "b12", "b 12", "b6", "b 6"] },
  { id: "nails", group: "Волосы, ногти", label: "Слоение и ломкость ногтей круглый год, не только в сухой зиме", geneSymbols: ["MTRR", "KRT81", "COL1A1"], vitaminSubstrings: ["биот", "b7", "b 7", "цинк", "кремн", "b6", "b 6", "аскорб", "c "] },
  { id: "fatigue", group: "Сила, сон", label: "Постоянная усталость при нормальном сне, без явной ночной бессонницы", geneSymbols: ["SIRT1", "FOXO3", "BDNF", "APOE"], vitaminSubstrings: ["q10", "убих", "magn", "магн", "b12", "b 12", "d3", "b6", "b 6"] },
  { id: "day_sleepy", group: "Сила, сон", label: "Сонливость днём при том, что ночью засыпаете без особых трудов", geneSymbols: ["BDNF", "CLOCK", "SIRT1"], vitaminSubstrings: ["магн", "b12", "b 12", "b6", "b 6", "q10", "d3", "d 3"] },
  { id: "sleep_fall", group: "Сила, сон", label: "Сложно заснуть: лежу долго, мысли крутятся", geneSymbols: ["BDNF", "CLOCK", "MTRR"], vitaminSubstrings: ["магн", "b6", "b 6", "b12", "b 12", "b5", "b 5", "b 1", "b1", "b 2", "b2", "b3", "b3", "b 3"] },
  { id: "night_wake", group: "Сила, сон", label: "Частые пробуждения ночью, потом трудно снова заснуть", geneSymbols: ["CLOCK", "BDNF", "MTRR"], vitaminSubstrings: ["магн", "b6", "b 6", "b5", "b5", "b1", "b1", "b2", "b2", "b3", "b3", "b12", "b 12"] },
  { id: "body_clock", group: "Сила, сон", label: "Сбитый режим: разное время сна/бодрствования, «плывут» сутки", geneSymbols: ["CLOCK", "BDNF", "MTRR"], vitaminSubstrings: ["магн", "b6", "b 6", "b 12", "b12", "b5", "b5", "b2", "b2"] },
  { id: "anxiety", group: "Психика, стресс", label: "Постоянный фоновый стресс, тяжёлый, «подкрученный» нервный фон (не про одну ситуацию)", geneSymbols: ["BDNF", "SIRT1", "APOE"], vitaminSubstrings: ["магн", "b6", "b 6", "b 12", "b12", "b9", "фолат", "d3", "d3"] },
  { id: "focus", group: "Психика, стресс", label: "Трудно удерживать внимание, ощущение «тумана в голове» в течение дня", geneSymbols: ["APOE", "BDNF", "SIRT1", "NQO1", "CLOCK"], vitaminSubstrings: ["b12", "b 12", "b6", "b 6", "b9", "фолат", "q10", "убих", "d3", "d3"] },
  { id: "pms_mood", group: "Цикл, кожа по циклу", label: "Перед месячными: раздражительность и смена настроения, без привязки к угрям", geneSymbols: ["ESR1", "SHBG", "BDNF"], vitaminSubstrings: ["b6", "b 6", "magn", "магн", "b12", "b 12", "b9", "фолат", "b 9"] },
  { id: "pms_acne", group: "Цикл, кожа по циклу", label: "Перед месячными: угри и жирный блеск, именно в этот период цикла", geneSymbols: ["ESR1", "MMP1", "VDR"], vitaminSubstrings: ["цинк", "аскорб", "c ", "b6", "b 6", "k2"] },
  { id: "pms_bloat", group: "Цикл, кожа по циклу", label: "Перед месячными: отёчность лица и тяжесть внизу живота", geneSymbols: ["ESR1", "SHBG"], vitaminSubstrings: ["магн", "b6", "b 6", "b12", "b 12", "k2"] },
  { id: "joints", group: "Суставы, кости", label: "Сустав болит или хрустит при обычной нагрузке, не после травмы", geneSymbols: ["COL1A1", "MMP1", "VDR"], vitaminSubstrings: ["d3", "d 3", "витамин d", "k2", "k 2", "кремн", "магн", "b12", "b 12"] },
  { id: "d_low", group: "Суставы, кости", label: "Мало дневного света или ранее в анализах низкий витамин D, зимой сильно хуже настроение", geneSymbols: ["VDR", "COL1A1", "APOE"], vitaminSubstrings: ["d3", "d 3", "витамин d", "магн", "k2", "k 2"] },
  { id: "smoke", group: "Среда, нагрузка", label: "В дыму или духоте: тошнота или сильная головная боль только в таких ситуациях, не «базовая мигрень день ото дня»", geneSymbols: ["GSTP1", "NQO1", "GPX1", "CAT"], vitaminSubstrings: ["аскорб", "c ", "селен", "цинк", "magn", "магн", "b2", "b 2", "b6", "b 6"] },
  { id: "exercise", group: "Среда, нагрузка", label: "Долгое восстановление силы после силовых или интервальных тренировок, сильно дольше, чем раньше", geneSymbols: ["SIRT1", "FOXO3", "GPX1", "CAT"], vitaminSubstrings: ["q10", "убих", "magn", "магн", "аскорб", "b12", "b 12"] },
];

export function matchVitaminBySubstrings(vitaminName, substrings) {
  const n = (vitaminName || "").toLowerCase();
  return substrings.some((s) => s && n.includes(s.toLowerCase().trim()));
}

export function buildGeneScoreMap(selectedIds) {
  const m = new Map();
  for (const item of SYMPTOM_ITEMS) {
    if (!selectedIds.has(item.id)) continue;
    const seen = new Set();
    for (const sym of item.geneSymbols) {
      if (seen.has(sym)) continue;
      seen.add(sym);
      m.set(sym, (m.get(sym) || 0) + 1);
    }
  }
  return m;
}

export function buildVitaminScoreMap(catalog, selectedIds) {
  const arr = (catalog || [])
    .map((v) => {
      if (!v || !v.name) return { v, score: 0 };
      let sc = 0;
      for (const item of SYMPTOM_ITEMS) {
        if (!selectedIds.has(item.id)) continue;
        if (matchVitaminBySubstrings(v.name, item.vitaminSubstrings)) {
          sc += 1;
        }
      }
      return { v, score: sc };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return arr;
}
