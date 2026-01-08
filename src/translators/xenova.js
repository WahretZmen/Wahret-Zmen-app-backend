// backend/translators/xenova.js

/**
 * Lightweight wrapper around @xenova/transformers pipelines.
 * - Lazily loads FR↔AR translation models once, then reuses them.
 * - Provides a safe translateXenova() and a tiny Arabic normalizer arFix().
 */

let pipes; // cached pipelines (singleton)

/**
 * Load and cache translation pipelines the first time we need them.
 * Models:
 *  - fr→ar: Helsinki-NLP/opus-mt-fr-ar
 *  - ar→fr: Helsinki-NLP/opus-mt-ar-fr
 */
async function load() {
  if (pipes) return pipes;

  const { pipeline/*, env*/ } = await import("@xenova/transformers");

  // Optional local cache:
  // const path = require("path");
  // env.cacheDir = path.resolve(process.cwd(), ".cache/transformers");

  pipes = {
    "fr-ar": await pipeline("translation", "Helsinki-NLP/opus-mt-fr-ar"),
    "ar-fr": await pipeline("translation", "Helsinki-NLP/opus-mt-ar-fr"),
  };

  return pipes;
}

/**
 * Translate using Xenova pipelines.
 * @param {string} text  - source text
 * @param {string} to    - target lang code ('ar' or 'fr')
 * @param {string} from  - source lang code ('fr' or 'ar')
 * @returns {Promise<string>} translated text (never throws for missing output)
 *
 * Usage:
 *   const ar = await translateXenova("Bonjour", "ar", "fr");
 *   const fr = await translateXenova("مرحبا", "fr", "ar");
 */
async function translateXenova(text, to, from) {
  const key = `${from}-${to}`; // ✅ correct key format
  const p = (await load())[key];
  if (!p) throw new Error(`No pipeline for ${key}`);
  const out = await p(String(text ?? ""));
  return out?.[0]?.translation_text ?? String(text ?? "");
}

/**
 * Tiny Arabic post-processor to normalize a few known issues:
 * - Fixes common mistranslations of "الجبة التونسية"
 * - Removes Kashida (tatweel) and extra spaces
 */
function arFix(s) {
  return String(s || "")
    .replace(/\bالتونسي جبة\b/g, "الجبة التونسية") // common MT inversion
    .replace(/\bجبة تونسية\b/g, "الجبة التونسية")   // variant normalization
    .replace(/[\u0640]+/g, "")                       // remove tatweel
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { translateXenova, arFix, load };
