const Product = require("./product.model");
// keep translate-google as a last-resort fallback (optional)
const translateGoogle = require("translate-google");

const { translateXenova, arFix } = require("../translators/xenova.js");
const { GLOSSARY_FR_AR, protectTerms } = require("../translators/glossary.js");

// ---------- Smart FR → AR title formatter (keeps order) ----------
const FR_COLORS = {
  blanc: "الأبيض",
  bleu: "الأزرق",
  noir: "الأسود",
  rouge: "الأحمر",
  vert: "الأخضر",
  jaune: "الأصفر",
  beige: "البيج",
  gris: "الرمادي",
  marron: "البني",
  violet: "الأرجواني",
  rose: "الوردي",
  orange: "البرتقالي",
  doré: "الذهبي",
  argenté: "الفضي",
};
const FR_PATTERNS = {
  "rayée": "مخططة",
  "rayé": "مخطط",
  "à rayures": "مخططة",
  "unis": "سادة",
};
const FR_STYLES = {
  "style moderne": "طراز حديث",
  "style classique": "طراز كلاسيكي",
  "style traditionnel": "طراز تقليدي",
};

function normFR(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractColorsFR(s) {
  const found = [];
  let rest = s;
  for (const k of Object.keys(FR_COLORS)) {
    const rx = new RegExp(`\\b${k}\\b`, "i");
    if (rx.test(rest)) {
      found.push(FR_COLORS[k]);
      rest = rest.replace(rx, "").trim();
    }
  }
  return { colorsAR: found, rest };
}

function extractOneOfFR(s, dict) {
  let rest = s, ar = "";
  // longest first so "style moderne" wins over "style"
  const keys = Object.keys(dict).sort((a,b)=>b.length-a.length);
  for (const k of keys) {
    const rx = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (rx.test(rest)) {
      ar = dict[k];
      rest = rest.replace(rx, "").trim();
      break;
    }
  }
  return { ar, rest };
}

/**
 * Make an Arabic title with fixed order:
 *   "الجبة التونسية" + [pattern] + [بالـ + colors joined with "و"] + [ – style]
 * Falls back to generic MT if we can’t detect anything.
 */
async function translateTitleSmartFRtoAR(frTitle) {
  if (!frTitle) return "";
  const raw = frTitle.trim();

  // Make sure the product noun stays put:
  let base = raw.replace(/jebba tunisienne/ig, "الجبة التونسية");

  // Split on dash if present (left: main, right: tagline)
  const parts = base.split(/–|—|-/);
  let left = parts[0].trim();
  let right = parts[1] ? parts.slice(1).join(" - ").trim() : "";

  // COLORS (Blanc, Bleu, …)
  const { colorsAR, rest: leftWithoutColors } = extractColorsFR(left);
  left = leftWithoutColors;

  // PATTERN (rayée, à rayures, unis, …)
  const { ar: patternAR, rest: left2 } = extractOneOfFR(left, FR_PATTERNS);
  left = left2;

  // STYLE (style moderne, …) – usually in the right part
  let styleAR = "";
  if (right) {
    const styleRes = extractOneOfFR(right, FR_STYLES);
    styleAR = styleRes.ar;
    right = styleRes.rest;
  } else {
    const styleRes = extractOneOfFR(left, FR_STYLES);
    styleAR = styleRes.ar;
    left = styleRes.rest;
  }

  // Compose Arabic
  let ar = "الجبة التونسية";
  if (patternAR) ar += " " + patternAR;
  if (colorsAR.length) {
    const joined = colorsAR.join(" و");
    ar += " " + "بال" + joined.replace(/^ال/, "ال"); // e.g., "بالأبيض والأزرق"
  }
  if (styleAR) ar += " – " + styleAR;

  // If we failed to recognize anything special and produced only the noun,
  // fall back to your existing MT pipeline so you still get something.
  if (ar.trim() === "الجبة التونسية") {
    const mt = await translateDetails(frTitle, "ar");
    return mt || "الجبة التونسية";
  }
  return ar.trim();
}


// Safe translator: prefer Xenova FR→AR with glossary; fall back to google; never throws
const translateDetails = async (text, lang) => {
  const src = typeof text === "string" ? text : String(text ?? "");
  try {
    if (lang === "fr") return src;                 // admin enters FR; FR stays as-is
    if (lang === "ar") {
      const pt = protectTerms(src, GLOSSARY_FR_AR);
      const out = await translateXenova(pt.text, "ar", "fr"); // FR -> AR (local, free)
      return arFix(pt.restore(out));
    }
    // If you ever need EN, you could do: translateXenova(src, 'en', 'fr') or just return src
    return src;
  } catch (e) {
    // last-resort fallback to translate-google (optional)
    try {
      const out = await translateGoogle(src, { to: lang });
      return lang === "ar" ? arFix(out) : out || src;
    } catch {
      return src;
    }
  }
};



/***********************
 *  COLOR I18N (expanded)
 ***********************/
const stripKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")                // remove accents
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");

// Map MANY French/Arabic surface forms → a single EN base key
const COLOR_MAP_ANY_TO_EN = {
  // ------- Whites / Neutrals -------
  "white": "white",
  "blanc": "white",
  "off white": "off-white",
  "blanc casse": "off-white",
  "ecru": "ecru",
  "ivory": "ivory",
  "ivoire": "ivory",
  "cream": "cream",
  "creme": "cream",
  "beige": "beige",
  "sand": "sand",
  "sable": "sand",
  "tan": "tan",
  "camel": "camel",
  "taupe": "taupe",
  "gris": "grey",
  "gray": "grey",
  "light grey": "light-grey",
  "gris clair": "light-grey",
  "dark grey": "dark-grey",
  "gris fonce": "dark-grey",
  "charcoal": "charcoal",
  "anthracite": "charcoal",
  "graphite": "graphite",
  "smoke": "smoke",
  "smoky": "smoke",
  "transparent": "transparent",
  "clear": "clear",
  "crystal": "crystal",

  // ------- Browns -------
  "brown": "brown",
  "marron": "brown",
  "brun": "brown",
  "chocolate": "chocolate",
  "chocolat": "chocolate",
  "coffee": "coffee",
  "cafe": "coffee",
  "walnut": "walnut",
  "noyer": "walnut",
  "caramel": "caramel",
  "cognac": "cognac",
  "mahogany": "mahogany",
  "acajou": "mahogany",

  // ------- Yellows / Or -------
  "yellow": "yellow",
  "jaune": "yellow",
  "mustard": "mustard",
  "moutarde": "mustard",
  "gold": "gold",
  "dore": "gold",
  "or": "gold",
  "honey": "honey",
  "miel": "honey",
  "lemon": "lemon",
  "citron": "lemon",
  "champagne": "champagne",

  // ------- Oranges -------
  "orange": "orange",
  "burnt orange": "burnt-orange",
  "orange brule": "burnt-orange",
  "terracotta": "terracotta",
  "coral": "coral",
  "corail": "coral",
  "apricot": "apricot",
  "abricot": "apricot",
  "peach": "peach",
  "peche": "peach",
  "salmon": "salmon",
  "saumon": "salmon",

  // ------- Reds / Wines -------
  "red": "red",
  "rouge": "red",
  "crimson": "crimson",
  "cramoisi": "crimson",
  "scarlet": "scarlet",
  "ecarlate": "scarlet",
  "burgundy": "burgundy",
  "bordeaux": "burgundy",
  "maroon": "maroon",
  "wine": "wine",
  "vin": "wine",

  // ------- Greens -------
  "green": "green",
  "vert": "green",
  "mint": "mint",
  "menthe": "mint",
  "sage": "sage",
  "sauge": "sage",
  "emerald": "emerald",
  "emeraude": "emerald",
  "forest": "forest",
  "vert foret": "forest",
  "olive": "olive",
  "olive drab": "olive",
  "khaki": "khaki",
  "kaki": "khaki",
  "lime": "lime",

  // ------- Blues / Teals -------
  "blue": "blue",
  "bleu": "blue",
  "navy": "navy",
  "bleu marine": "navy",
  "royal blue": "royal-blue",
  "bleu roi": "royal-blue",
  "sky blue": "sky-blue",
  "bleu ciel": "sky-blue",
  "baby blue": "baby-blue",
  "bleu bebe": "baby-blue",
  "azure": "azure",
  "azur": "azure",
  "indigo": "indigo",
  "cyan": "cyan",
  "turquoise": "turquoise",
  "teal": "teal",
  "sarcelle": "teal",

  // ------- Purples / Pinks -------
  "purple": "purple",
  "violet": "purple",
  "lavender": "lavender",
  "lavande": "lavender",
  "lilac": "lilac",
  "lilas": "lilac",
  "magenta": "magenta",
  "fuchsia": "fuchsia",
  "plum": "plum",
  "prune": "plum",

  // ------- Metals / Finishes -------
  "black": "black",
  "noir": "black",
  "silver": "silver",
  "argente": "silver",
  "rose gold": "rose-gold",
  "or rose": "rose-gold",
  "bronze": "bronze",
  "copper": "copper",
  "cuivre": "copper",
  "pewter": "pewter",
  "etain": "pewter",
  "gunmetal": "gunmetal",
  "canon de fusil": "gunmetal",
  "tortoise": "tortoise",
  "ecaille": "tortoise",
  "horn": "horn",
  "corne": "horn",
  "matte": "matte",     // (modifier handled by having separate keys too)
  "glossy": "glossy",

  // ------- Arabic direct forms → EN -------
  "اصفر": "yellow",
  "ابيض": "white",
  "اوف وايت": "off-white",
  "عاجي": "ivory",
  "كريمي": "cream",
  "بيج": "beige",
  "رملي": "sand",
  "تان": "tan",
  "جملي": "camel",
  "تاوب": "taupe",
  "رمادي": "grey",
  "رمادي فاتح": "light-grey",
  "رمادي داكن": "dark-grey",
  "فحمي": "charcoal",
  "غرافيت": "graphite",
  "مدخن": "smoke",
  "شفاف": "transparent",
  "كريستالي": "crystal",

  "بني": "brown",
  "شوكولاته": "chocolate",
  "قهوة": "coffee",
  "جوزي": "walnut",
  "كراميل": "caramel",
  "كونياك": "cognac",
  "ماهوجني": "mahogany",

  "ذهبي": "gold",
  "خردلي": "mustard",
  "عسلي": "honey",
  "ليموني": "lemon",
  "شمبانيا": "champagne",

  "برتقالي": "orange",
  "برتقالي محروق": "burnt-orange",
  "طوبي": "terracotta",
  "مرجاني": "coral",
  "مشمشي": "apricot",
  "خوخي": "peach",
  "سالمون": "salmon",

  "احمر": "red",
  "قرمزي": "crimson",
  "خمري": "burgundy",
  "عنابي": "maroon",

  "اخضر": "green",
  "نعناعي": "mint",
  "مريمي": "sage",
  "زمردي": "emerald",
  "اخضر غامق": "forest",
  "زيتي": "olive",
  "كاكي": "khaki",
  "اخضر فاقع": "lime",

  "ازرق": "blue",
  "كحلي": "navy",
  "ازرق ملكي": "royal-blue",
  "ازرق سماوي": "sky-blue",
  "ازرق فاتح": "baby-blue",
  "لازوردي": "azure",
  "نيلي": "indigo",
  "سماوي": "cyan",
  "فيروزي": "turquoise",
  "ازرق مخضر": "teal",

  "ارجواني": "purple",
  "لافندر": "lavender",
  "ارجواني فاتح": "lilac",
  "ماجنتا": "magenta",
  "فوشيا": "fuchsia",
  "برقوقي": "plum",

  "اسود": "black",
  "فضي": "silver",
  "ذهبي وردي": "rose-gold",
  "برونزي": "bronze",
  "نحاسي": "copper",
  "قصديري": "pewter",
  "رمادي معدني غامق": "gunmetal",
  "صدفي": "tortoise",
  "قرني": "horn",
  "متعدد الالوان": "multicolor",

  // compound FR/AR -> direct EN
  "blanc creme": "cream-white",
  "cream white": "cream-white",
  "noir adouci": "off-black",
  "off black": "off-black",
  "multi": "multicolor",
  "multicolore": "multicolor",
};

const COLOR_DICT_EN = {
  // Whites / Neutrals
  "white": { fr: "Blanc", ar: "أبيض" },
  "off-white": { fr: "Blanc cassé", ar: "أوف وايت" },
  "ivory": { fr: "Ivoire", ar: "عاجي" },
  "ecru": { fr: "Écru", ar: "عاجي" },
  "cream": { fr: "Crème", ar: "كريمي" },
  "cream-white": { fr: "Blanc crème", ar: "أبيض كريمي" },
  "beige": { fr: "Beige", ar: "بيج" },
  "sand": { fr: "Sable", ar: "رملي" },
  "tan": { fr: "Tan", ar: "تان" },
  "camel": { fr: "Camel", ar: "جملي" },
  "taupe": { fr: "Taupe", ar: "رمادي بني" },
  "grey": { fr: "Gris", ar: "رمادي" },
  "light-grey": { fr: "Gris clair", ar: "رمادي فاتح" },
  "dark-grey": { fr: "Gris foncé", ar: "رمادي داكن" },
  "charcoal": { fr: "Anthracite", ar: "فحمي" },
  "graphite": { fr: "Graphite", ar: "رمادي غرافيت" },
  "smoke": { fr: "Fumé", ar: "مدخن" },
  "transparent": { fr: "Transparent", ar: "شفاف" },
  "clear": { fr: "Transparent", ar: "شفاف" },
  "crystal": { fr: "Cristal", ar: "كريستالي" },
  "off-black": { fr: "Noir adouci", ar: "أسود مخفف" },

  // Browns
  "brown": { fr: "Marron", ar: "بني" },
  "chocolate": { fr: "Chocolat", ar: "شوكولاتة" },
  "coffee": { fr: "Café", ar: "قهوة" },
  "walnut": { fr: "Noyer", ar: "جوزي" },
  "caramel": { fr: "Caramel", ar: "كراميل" },
  "cognac": { fr: "Cognac", ar: "كونياك" },
  "mahogany": { fr: "Acajou", ar: "ماهوجني" },

  // Yellows / Or
  "yellow": { fr: "Jaune", ar: "أصفر" },
  "mustard": { fr: "Moutarde", ar: "خردلي" },
  "gold": { fr: "Doré", ar: "ذهبي" },
  "honey": { fr: "Miel", ar: "عسلي" },
  "lemon": { fr: "Citron", ar: "ليموني" },
  "champagne": { fr: "Champagne", ar: "شمبانيا" },

  // Oranges
  "orange": { fr: "Orange", ar: "برتقالي" },
  "burnt-orange": { fr: "Orange brûlé", ar: "برتقالي محروق" },
  "terracotta": { fr: "Terracotta", ar: "طوبي" },
  "coral": { fr: "Corail", ar: "مرجاني" },
  "apricot": { fr: "Abricot", ar: "مشمشي" },
  "peach": { fr: "Pêche", ar: "خوخي" },
  "salmon": { fr: "Saumon", ar: "سالمون" },

  // Reds / Wines
  "red": { fr: "Rouge", ar: "أحمر" },
  "crimson": { fr: "Cramoisi", ar: "قرمزي" },
  "scarlet": { fr: "Écarlate", ar: "قرمزي فاقع" },
  "burgundy": { fr: "Bordeaux", ar: "خمري" },
  "maroon": { fr: "Marron foncé", ar: "عنابي" },
  "wine": { fr: "Vin", ar: "خمري" },

  // Greens
  "green": { fr: "Vert", ar: "أخضر" },
  "mint": { fr: "Menthe", ar: "نعناعي" },
  "sage": { fr: "Sauge", ar: "مريمي" },
  "emerald": { fr: "Émeraude", ar: "زمردي" },
  "forest": { fr: "Vert forêt", ar: "أخضر غامق" },
  "olive": { fr: "Olive", ar: "زيتي" },
  "khaki": { fr: "Kaki", ar: "كاكي" },
  "lime": { fr: "Citron vert", ar: "أخضر فاقع" },

  // Blues / Teals
  "blue": { fr: "Bleu", ar: "أزرق" },
  "navy": { fr: "Bleu marine", ar: "كحلي" },
  "royal-blue": { fr: "Bleu roi", ar: "أزرق ملكي" },
  "sky-blue": { fr: "Bleu ciel", ar: "أزرق سماوي" },
  "baby-blue": { fr: "Bleu bébé", ar: "أزرق فاتح" },
  "azure": { fr: "Azur", ar: "لازوردي" },
  "indigo": { fr: "Indigo", ar: "نيلي" },
  "cyan": { fr: "Cyan", ar: "سماوي" },
  "turquoise": { fr: "Turquoise", ar: "فيروزي" },
  "teal": { fr: "Sarcelle", ar: "أزرق مخضر" },

  // Purples / Pinks
  "purple": { fr: "Violet", ar: "أرجواني" },
  "lavender": { fr: "Lavande", ar: "لافندر" },
  "lilac": { fr: "Lilas", ar: "أرجواني فاتح" },
  "magenta": { fr: "Magenta", ar: "ماجنتا" },
  "fuchsia": { fr: "Fuchsia", ar: "فوشيا" },
  "plum": { fr: "Prune", ar: "برقوقي" },

  // Metals / Finishes
  "black": { fr: "Noir", ar: "أسود" },
  "silver": { fr: "Argenté", ar: "فضي" },
  "rose-gold": { fr: "Or rose", ar: "ذهبي وردي" },
  "bronze": { fr: "Bronze", ar: "برونزي" },
  "copper": { fr: "Cuivré", ar: "نحاسي" },
  "pewter": { fr: "Étain", ar: "قصديري" },
  "gunmetal": { fr: "Canon de fusil", ar: "رمادي معدني غامق" },
  "tortoise": { fr: "Écaille", ar: "صدفي" },
  "horn": { fr: "Corne", ar: "قرني" },

  // Multi
  "multicolor": { fr: "Multicolore", ar: "متعدد الألوان" },
};

function toENBaseColor(raw) {
  const key = stripKey(raw);
  return COLOR_MAP_ANY_TO_EN[key] || key;
}

async function translateColorNameSmart(raw) {
  const en = String(raw || "");
  const base = toENBaseColor(en);
  const dict = COLOR_DICT_EN[base];
  if (dict) {
    return { en, fr: dict.fr, ar: dict.ar };
  }
  // fallback to MT if unknown
  return {
    en,
    fr: await translateDetails(en, "fr"),
    ar: await translateDetails(en, "ar"),
  };
}


// ---------- CREATE ----------
const postAProduct = async (req, res) => {
  try {
    let {
      title,
      description,
      category,
      newPrice,
      oldPrice,
      colors,
      trending,
      coverImage,
    } = req.body;

    // Base validations
    const missing = [];
    if (!title) missing.push("title");
    if (!description) missing.push("description");
    if (!category) missing.push("category");
    if (newPrice === undefined) missing.push("newPrice");
    if (oldPrice === undefined) missing.push("oldPrice");
    if (!Array.isArray(colors) || colors.length === 0) missing.push("colors");

    if (missing.length) {
      return res
        .status(400)
        .json({ success: false, message: `Missing required fields: ${missing.join(", ")}` });
    }

    // Normalize incoming colors
    const normalizedIncoming = colors.map((c) => {
      const images = Array.isArray(c.images) && c.images.length
        ? c.images
        : (c.image ? [c.image] : []);
      return {
        colorName: typeof c.colorName === "string" ? c.colorName : (c.colorName?.en || ""),
        images,
        stock: Number(c.stock) || 0,
      };
    });

    // Each color must have at least 1 image
    if (normalizedIncoming.some((c) => !Array.isArray(c.images) || c.images.length === 0)) {
      return res.status(400).json({ success: false, message: "Each color must have at least one image" });
    }

    // Fallback cover: first color first image
    const safeCover = coverImage || normalizedIncoming[0]?.images?.[0] || "";
    if (!safeCover) {
      return res.status(400).json({ success: false, message: "coverImage is required" });
    }

    // Translations
   const translatedColors = await Promise.all(
  normalizedIncoming.map(async (c) => {
    const pack = await translateColorNameSmart(c.colorName);
    return {
      colorName: pack, // {en, fr, ar}
      images: c.images,
      stock: c.stock,
    };
  })
);


    const titleFR = await translateDetails(title, "fr");
    const titleAR = await translateDetails(title, "ar");
    const descFR = await translateDetails(description, "fr");
    const descAR = await translateDetails(description, "ar");

    const stockQuantity = translatedColors.reduce((acc, c) => acc + (c.stock || 0), 0);

    const product = await Product.create({
      title,
      description,
      translations: {
        en: { title, description },
        fr: { title: titleFR, description: descFR },
        ar: { title: titleAR, description: descAR },
      },
      category,
      coverImage: safeCover,
      colors: translatedColors,
      oldPrice: Number(oldPrice),
      newPrice: Number(newPrice),
      stockQuantity,
      trending: !!trending,
    });

    res.status(201).json({ success: true, message: "Product created successfully", product });
  } catch (error) {
    console.error("❌ Error creating product:", error);
    const status = error?.name === "ValidationError" ? 400 : 500;
    res.status(status).json({
      success: false,
      message: error?.message || "Failed to create product",
    });
  }
};

// ---------- READ: ALL ----------
const getAllProducts = async (_req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};

// ---------- READ: ONE ----------
const getSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }
    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ success: false, message: "Failed to fetch product" });
  }
};

// ---------- UPDATE ----------
// ---------- UPDATE ----------
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      title,
      description,
      category,
      newPrice,
      oldPrice,
      colors = [],
      trending,
      coverImage,
      translations, // optional: { fr:{title,description}, ar:{title,description} }
    } = req.body;

    const existing = await Product.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    if (!title || !description || !category) {
      return res
        .status(400)
        .json({ success: false, message: "title, description and category are required" });
    }
    if (!Array.isArray(colors) || colors.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "At least one color must be provided." });
    }

    // Normalize incoming colors (strings or {en,fr,ar}) and images/image
    const normalized = colors.map((c) => {
      const images = Array.isArray(c.images) && c.images.length
        ? c.images
        : (c.image ? [c.image] : []);
      return {
        colorName: typeof c.colorName === "string" ? c.colorName : (c.colorName?.en || ""),
        images,
        stock: Number(c.stock) || 0,
      };
    });

    // Each color must have at least one image
    if (normalized.some((c) => !Array.isArray(c.images) || c.images.length === 0)) {
      return res
        .status(400)
        .json({ success: false, message: "Each color must have at least one image" });
    }

    // Cover fallback: provided -> existing -> first color image
    const safeCover = coverImage || existing.coverImage || normalized[0]?.images?.[0] || "";
    if (!safeCover) {
      return res.status(400).json({ success: false, message: "coverImage is required" });
    }

    // Title/description translations (allow manual overrides if provided)
    const frTitle = translations?.fr?.title || await translateDetails(title, "fr");
    const arTitle = translations?.ar?.title || await translateDetails(title, "ar");
    const frDesc  = translations?.fr?.description || await translateDetails(description, "fr");
    const arDesc  = translations?.ar?.description || await translateDetails(description, "ar");

    // Color name translations (dictionary-first, MT fallback)
    const colorsTranslated = await Promise.all(
      normalized.map(async (c) => {
        const pack = await translateColorNameSmart(c.colorName); // -> {en,fr,ar}
        return { colorName: pack, images: c.images, stock: c.stock };
      })
    );

    // Assign & save
    existing.title = title;
    existing.description = description;
    existing.translations = {
      en: { title, description },
      fr: { title: frTitle, description: frDesc },
      ar: { title: arTitle, description: arDesc },
    };
    existing.category = category;
    existing.coverImage = safeCover;
    existing.colors = colorsTranslated;
    if (oldPrice !== undefined) existing.oldPrice = Number(oldPrice);
    if (newPrice !== undefined) existing.newPrice = Number(newPrice);
    existing.stockQuantity = colorsTranslated.reduce((sum, c) => sum + (c.stock || 0), 0);
    existing.trending = !!trending;

    await existing.save();

    return res
      .status(200)
      .json({ success: true, message: "Product updated successfully", product: existing });
  } catch (error) {
    console.error("Error updating product:", error);
    const status = error?.name === "ValidationError" ? 400 : 500;
    return res
      .status(status)
      .json({ success: false, message: error?.message || "Failed to update product" });
  }
};


// ---------- DELETE ----------
const deleteAProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await Product.findByIdAndDelete(id);
    if (!deletedProduct) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }
    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      product: deletedProduct,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ success: false, message: "Failed to delete product" });
  }
};

// ---------- Update price by percentage (utility) ----------
const updateProductPriceByPercentage = async (req, res) => {
  const { id } = req.params;
  const { percentage } = req.body;
  try {
    const p = await Product.findById(id);
    if (!p) return res.status(404).json({ success: false, message: "Product not found!" });
    const discount = (Number(p.oldPrice) * Number(percentage)) / 100;
    const finalPrice = Number(p.oldPrice) - discount;
    // If you want to persist, you can do: p.newPrice = finalPrice; await p.save();
    res.status(200).json({ success: true, message: "Price updated successfully", finalPrice });
  } catch (error) {
    console.error("Error updating product price:", error);
    res.status(500).json({ success: false, message: "Failed to update product price" });
  }
};

module.exports = {
  postAProduct,
  getAllProducts,
  getSingleProduct,
  updateProduct,
  deleteAProduct,
  updateProductPriceByPercentage,
};
