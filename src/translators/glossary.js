/// backend/translators/glossary.js

/**
 * 🔖 FR → AR glossary
 * These mappings are applied *before* machine translation to protect key terms.
 * After MT, placeholders are restored with the correct target-language term.
 */
const GLOSSARY_FR_AR = {
  // Product nouns / style phrases
  "Jebba tunisienne": "الجبة التونسية",
  "Jebba": "الجبة",
  "Style moderne": "طراز حديث",
  "style moderne": "طراز حديث",
  "Style classique": "طراز كلاسيكي",
  "Style traditionnel": "طراز تقليدي",

  // Patterns often used in titles
  "rayée": "مخططة",
  "rayé": "مخطط",
  "à rayures": "مخططة",

  // Common color forms
  "Blanc": "الأبيض",
  "Bleu": "الأزرق",
  "Noir": "الأسود",

  // Materials / fabrics
  "broderies dorées": "تطريزات ذهبية",
  "soie": "حرير",
  "lin": "كتان",
  "coton": "قطن",

  // Audiences
  "homme": "رجال",
  "femme": "نساء",
  "enfant": "أطفال",

  // 👉 Add brand names, size labels, fabrics, or recurring phrases as needed
};

/**
 * Escape regex special characters in a string.
 */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Protect glossary terms before MT by replacing them with unique tokens.
 * Restores tokens afterward with correct target-language values.
 */
function protectTerms(text, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length); // longest first
  const marks = [];
  let safeText = String(text ?? "");

  keys.forEach((k, i) => {
    const token = `@@${i}@@`; // unique placeholder
    const rx = new RegExp(escapeRegExp(k), "gi"); // global, case-insensitive
    if (rx.test(safeText)) {
      safeText = safeText.replace(rx, token);
      marks.push({ token, value: map[k] }); // store replacement
    }
  });

  return {
    text: safeText,
    restore(translated) {
      let s = String(translated ?? "");
      for (const { token, value } of marks) {
        s = s.replaceAll(token, value);
      }
      return s;
    },
  };
}

module.exports = { GLOSSARY_FR_AR, protectTerms };
