/**
 * Симптомы → кандидаты: ген (symbol) и подстроки для сопоставления с названиями
 * витаминов из /api/patient/vitamins/catalog/ (без жёсткой привязки к id).
 * Гены, которых нет в каталоге, в результате не показываются.
 */
export const SYMPTOM_ITEMS = [
  {
    id: "apetit_weight",
    label: "Сильный голод, трудно насытиться, тенденция к набору веса",
    geneSymbols: ["FTO", "TCF7L2", "APOE"],
    vitaminSubstrings: ["магн", "цинк", "b6", "b 6", "b 7", "b7", "биот", "k2"],
  },
  {
    id: "skin_aging",
    label: "Сухая кожа, тусклый тон, морщины, заметно фотостарение",
    geneSymbols: ["VDR", "COL1A1", "MMP1", "MC1R", "GPX1", "CAT"],
    vitaminSubstrings: ["k2", "k 2", "аскорб", "c)", "c ", "биот", "ликопин", "астаксан", "цинк", "кремн", "ликоп", "q10", "убих", "magn", "магн"],
  },
  {
    id: "hair_nails",
    label: "Ломкие волосы и ногти, сухость / выпадение волос, тусклость",
    geneSymbols: ["KRT81", "EDAR", "TYR", "COL1A1", "MTRR", "MMP1"],
    vitaminSubstrings: ["биот", "b7", "b 7", "цинк", "кремн", "b6", "b 6", "magn", "магн", "селен", "c)", "c "],
  },
  {
    id: "fatigue",
    label: "Хроническая усталость, слабость, сон днём при ночном отдыхе",
    geneSymbols: ["SIRT1", "FOXO3", "BDNF", "TCF7L2", "CLOCK", "APOE"],
    vitaminSubstrings: ["q10", "убих", "magn", "магн", "b6", "b 6", "цинк", "b12", "b 12", "b9", "фолат", "b 9"],
  },
  {
    id: "sleep_stress",
    label: "Тревожность, трудно заснуть, сбитый режим сна и бодрствования",
    geneSymbols: ["CLOCK", "BDNF", "MTRR", "SHBG", "ESR1"],
    vitaminSubstrings: ["magn", "магн", "b6", "b 6", "b12", "b 12", "q10", "убих"],
  },
  {
    id: "meteo_digest",
    label: "Вздутие, тяжесть после еды, чувствительный ЖКТ",
    geneSymbols: ["TCF7L2", "FTO", "APOE", "GSTP1"],
    vitaminSubstrings: ["магн", "c)", "c ", "b6", "b 6", "b 12", "k2", "b 9", "b9", "фолат"],
  },
  {
    id: "hormone_skin",
    label: "ПМС, до боли/акне перед циклом, отёчность, «дёгтевая» кожа",
    geneSymbols: ["ESR1", "SHBG", "CLOCK", "VDR", "FTO", "MMP1"],
    vitaminSubstrings: ["b6", "b 6", "magn", "магн", "цинк", "k2", "b 12", "b9", "фолат"],
  },
  {
    id: "bones",
    label: "Болезненные суставы, слабость костей, низкая толерантность к солнцу / мало дневного света",
    geneSymbols: ["VDR", "COL1A1", "APOE", "FTO", "MMP1"],
    vitaminSubstrings: ["k2", "k 2", "d3", "витамин d", "магн", "magn", "кремн", "цинк", "b12", "b 12"],
  },
  {
    id: "cognition",
    label: "Снижение концентрации, когнитивная усталость, «забывчивость»",
    geneSymbols: ["APOE", "BDNF", "SIRT1", "FOXO3", "NQO1", "CLOCK"],
    vitaminSubstrings: [
      "b12",
      "b 12",
      "b6",
      "b 6",
      "b9",
      "фолат",
      "q10",
      "убих",
      "магн",
      "d3",
      "d 3",
    ],
  },
  {
    id: "detox_oxy",
    label: "Сильный запах, дым, тяжёлая нагрузка: быстрая усталость, «токсичное» ощущение",
    geneSymbols: ["GSTP1", "GPX1", "CAT", "NQO1", "CLOCK", "SIRT1", "FTO"],
    vitaminSubstrings: ["c)", "c ", "аскорб", "селен", "цинк", "magn", "магн", "ликоп", "ликопин", "астакс", "b6", "b2", "b 2", "b 6", "b 12", "b12", "b 9", "b9", "b 7", "b7", "b1", "b3", "b5"],
  },
  {
    id: "vascular_mood",
    label: "Скачки настроения после еды, сильные перепады энергии, чувствительность к сахару",
    geneSymbols: ["APOE", "TCF7L2", "VDR", "CLOCK", "BDNF", "FTO"],
    vitaminSubstrings: ["k2", "b 12", "b6", "b 6", "magn", "d3", "b1", "b2", "b3", "b5", "q10", "b 9", "b9"],
  },
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
