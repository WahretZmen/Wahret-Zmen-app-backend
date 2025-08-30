// backend/translators/xenova.js
let pipes;

async function load() {
  if (pipes) return pipes;
  const { pipeline, env } = await import('@xenova/transformers');
  // Optional cache:
  // env.cacheDir = require('path').resolve(process.cwd(), '.cache/transformers');

  pipes = {
    'fr-ar': await pipeline('translation', 'Helsinki-NLP/opus-mt-fr-ar'),
    'ar-fr': await pipeline('translation', 'Helsinki-NLP/opus-mt-ar-fr'),
  };
  return pipes;
}

async function translateXenova(text, to, from) {
  const key = `${from}-${to}`;                 // ✅ fix: correct key
  const p = (await load())[key];
  if (!p) throw new Error(`No pipeline for ${key}`);
  const out = await p(String(text ?? ''));
  return out?.[0]?.translation_text ?? String(text ?? '');
}

// Small Arabic normalizer for known issues
function arFix(s) {
  return String(s || '')
    .replace(/\bالتونسي جبة\b/g, 'الجبة التونسية') // ✅ existing fix
    .replace(/\bجبة تونسية\b/g, 'الجبة التونسية')   // ✅ common variant
    .replace(/[\u0640]+/g, '')                        // remove tatweel
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { translateXenova, arFix, load };
