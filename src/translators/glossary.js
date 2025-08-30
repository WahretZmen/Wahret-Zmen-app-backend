// backend/translators/glossary.js
const GLOSSARY_FR_AR = {
  // Product nouns / style phrases you want preserved
  'Jebba tunisienne': 'الجبة التونسية',
  'Jebba': 'الجبة',
  'Style moderne': 'طراز حديث',
  'style moderne': 'طراز حديث',
  'Style classique': 'طراز كلاسيكي',
  'Style traditionnel': 'طراز تقليدي',

  // Patterns often used in titles
  'rayée': 'مخططة',
  'rayé': 'مخطط',
  'à rayures': 'مخططة',

  // A few color surface forms (helps when falling back to MT)
  'Blanc': 'الأبيض',
  'Bleu': 'الأزرق',
  'Noir': 'الأسود',

  // Materials / other entities
  'broderies dorées': 'تطريزات ذهبية',
  'soie': 'حرير',
  'lin': 'كتان',
  'coton': 'قطن',

  // Audiences
  'homme': 'رجال',
  'femme': 'نساء',
  'enfant': 'أطفال',

  // Add brand names, size labels, fabrics, etc. here…
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function protectTerms(text, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  const marks = [];
  let t = String(text ?? '');

  keys.forEach((k, i) => {
    const token = `@@${i}@@`;                      // ✅ fix: template literal
    const rx = new RegExp(escapeRegExp(k), 'gi');  // case-insensitive, global
    if (rx.test(t)) {
      t = t.replace(rx, token);                    // replace all hits
      marks.push({ token, value: map[k] });        // value is already in target language
    }
  });

  return {
    text: t,
    restore(translated) {
      let s = String(translated ?? '');
      for (const { token, value } of marks) s = s.replaceAll(token, value);
      return s;
    },
  };
}

module.exports = { GLOSSARY_FR_AR, protectTerms };
