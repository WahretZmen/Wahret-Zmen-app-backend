// src/products/product.model.js
// SEO-ready multilingual product schema — preserves FR / AR / EN data without keyword stuffing.
import mongoose from "mongoose";

/* ---------- localized text ---------- */
const LangSchema = new mongoose.Schema(
  {
    ar: { type: String, default: "" },
    fr: { type: String, default: "" },
    en: { type: String, default: "" },
  },
  { _id: false }
);

/* ---------- product color ---------- */
const ColorSchema = new mongoose.Schema(
  {
    colorName: { type: LangSchema, default: () => ({}) },
    images: { type: [String], default: [] },
    image: { type: String, default: "" },
    stock: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

/* ---------- product pieces ---------- */
const PieceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: null, min: 0 },
  },
  { _id: true }
);

/* ---------- helpers ---------- */
const trimString = (value) =>
  typeof value === "string" ? value.trim() : value;

const cleanLang = (value = {}) => ({
  ar: trimString(value?.ar || ""),
  fr: trimString(value?.fr || ""),
  en: trimString(value?.en || ""),
});

const slugify = (value = "") =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 120);

const getPrimaryText = (...values) => {
  for (const value of values) {
    const cleaned = trimString(value || "");
    if (cleaned) return cleaned;
  }
  return "";
};

const normalizeCategory = (value) => {
  const raw = String(value || "").trim().toLowerCase();

  const map = {
    men: "men",
    man: "men",
    homme: "men",
    hommes: "men",
    رجال: "men",

    women: "women",
    woman: "women",
    femme: "women",
    femmes: "women",
    نساء: "women",

    children: "children",
    child: "children",
    enfant: "children",
    enfants: "children",
    أطفال: "children",
    اطفال: "children",
  };

  return map[raw] || raw;
};

const normalizeSubCategory = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const key = raw.toLowerCase();

  const map = {
    keswa: "keswa",
    كسوة: "keswa",

    accessories: "accessories",
    accessory: "accessories",
    accessoires: "accessories",
    إكسسوارات: "accessories",
    اكسسوارات: "accessories",

    costume: "costume",
    بدلة: "costume",

    vest: "vest",
    gilet: "vest",
    صدريّة: "vest",
    صدريه: "vest",

    mens_abaya: "mens_abaya",
    "abaya homme": "mens_abaya",
    "عباية رجالي": "mens_abaya",
    "عباية رجالية": "mens_abaya",

    jebba: "jebba",
    جبّة: "jebba",
    جبة: "jebba",
  };

  return map[key] || map[raw] || key.replace(/\s+/g, "_");
};

/* ---------- product schema ---------- */
const ProductSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    title: { type: String, default: "", trim: true },
    description: { type: String, required: true, trim: true },

    category: {
      type: String,
      required: true,
      enum: ["men", "women", "children"],
      trim: true,
      index: true,
    },

    subCategory: {
      type: String,
      default: "",
      enum: ["", "accessories", "costume", "vest", "mens_abaya", "jebba", "keswa"],
      trim: true,
      index: true,
    },

    coverImage: { type: String, required: true, trim: true },
    colors: { type: [ColorSchema], default: [] },

    oldPrice: { type: Number, default: null, min: 0 },
    newPrice: { type: Number, default: null, min: 0 },
    promotionRate: { type: Number, default: 0, min: 0, max: 100 },

    pieces: { type: [PieceSchema], default: [] },
    stockQuantity: { type: Number, default: 0, min: 0 },

    trending: { type: Boolean, default: false, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },

    embroideryCategory: { type: LangSchema, default: () => ({}) },
    sizes: { type: [String], default: [] },

    coupe: { type: LangSchema, default: () => ({}) },
    matiere: { type: LangSchema, default: () => ({}) },
    composition: { type: LangSchema, default: () => ({}) },
    madeIn: { type: LangSchema, default: () => ({}) },
    isHandmade: { type: Boolean, default: false },

    translations: {
      ar: {
        title: { type: String, default: "", trim: true },
        description: { type: String, default: "", trim: true },
      },
      fr: {
        title: { type: String, default: "", trim: true },
        description: { type: String, default: "", trim: true },
      },
      en: {
        title: { type: String, default: "", trim: true },
        description: { type: String, default: "", trim: true },
      },
    },

    seo: {
      slug: { type: String, default: "", trim: true },
      canonicalUrl: { type: String, default: "", trim: true },
      metaTitle: { type: String, default: "", trim: true },
      metaDescription: { type: String, default: "", trim: true },
      keywords: { type: [String], default: [] },
      imageAlt: { type: String, default: "", trim: true },
      ogTitle: { type: String, default: "", trim: true },
      ogDescription: { type: String, default: "", trim: true },
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

/* ---------- normalization ---------- */
ProductSchema.pre("validate", function normalizeProduct(next) {
  this.productId = trimString(this.productId || "");
  this.title = trimString(this.title || "");
  this.description = trimString(this.description || "");
  this.coverImage = trimString(this.coverImage || "");
  this.category = normalizeCategory(this.category);
  this.subCategory = normalizeSubCategory(this.subCategory);

  if (this.embroideryCategory) this.embroideryCategory = cleanLang(this.embroideryCategory);
  if (this.coupe) this.coupe = cleanLang(this.coupe);
  if (this.matiere) this.matiere = cleanLang(this.matiere);
  if (this.composition) this.composition = cleanLang(this.composition);
  if (this.madeIn) this.madeIn = cleanLang(this.madeIn);

  if (this.translations?.ar) {
    this.translations.ar.title = trimString(this.translations.ar.title || "");
    this.translations.ar.description = trimString(this.translations.ar.description || "");
  }

  if (this.translations?.fr) {
    this.translations.fr.title = trimString(this.translations.fr.title || "");
    this.translations.fr.description = trimString(this.translations.fr.description || "");
  }

  if (this.translations?.en) {
    this.translations.en.title = trimString(this.translations.en.title || "");
    this.translations.en.description = trimString(this.translations.en.description || "");
  }

  if (Array.isArray(this.sizes)) {
    this.sizes = [...new Set(this.sizes.map((size) => trimString(size || "")).filter(Boolean))];
  }

  if (Array.isArray(this.pieces)) {
    this.pieces = this.pieces
      .map((piece) => ({
        ...piece,
        name: trimString(piece?.name || ""),
        price:
          piece?.price === "" || piece?.price === null || piece?.price === undefined
            ? null
            : Math.max(0, Number(piece.price || 0)),
      }))
      .filter((piece) => piece.name);
  }

  if (Array.isArray(this.colors)) {
    this.colors = this.colors.map((color) => {
      const images = Array.isArray(color?.images)
        ? color.images.map((img) => trimString(img || "")).filter(Boolean)
        : [];

      const image = trimString(color?.image || images[0] || "");

      return {
        ...color,
        image,
        images: images.length ? images : image ? [image] : [],
        colorName: cleanLang(color?.colorName || {}),
        stock: Math.max(0, Number(color?.stock || 0)),
      };
    });
  }

  if (!this.stockQuantity && Array.isArray(this.colors) && this.colors.length) {
    this.stockQuantity = this.colors.reduce(
      (sum, color) => sum + Math.max(0, Number(color?.stock || 0)),
      0
    );
  }

  const fallbackTitle = getPrimaryText(
    this.translations?.ar?.title,
    this.title,
    this.translations?.fr?.title,
    this.translations?.en?.title,
    this.productId
  );

  const fallbackDescription = getPrimaryText(
    this.translations?.ar?.description,
    this.description,
    this.translations?.fr?.description,
    this.translations?.en?.description
  );

  const providedSlug = trimString(this.seo?.slug || "");
  const generatedSlugBase = getPrimaryText(
    this.translations?.ar?.title,
    this.title,
    this.productId
  );

  const generatedSlug = slugify(generatedSlugBase || this.productId || "");
  const safeProductIdSlug = slugify(this.productId || "");

  const canonicalSlug = providedSlug
    ? slugify(providedSlug)
    : [generatedSlug, safeProductIdSlug]
        .filter(Boolean)
        .filter((value, index, arr) => arr.indexOf(value) === index)
        .join("-");

  const canonicalUrl = canonicalSlug
    ? `https://www.wahretzmen.com/products/${encodeURIComponent(canonicalSlug)}`
    : "";

  const keywordCandidates = [
    fallbackTitle,
    this.productId,
    this.category,
    this.subCategory,
    cleanLang(this.embroideryCategory || {}).ar,
    "وهرة زمان",
    "Wahret Zmen",
    "جبة تونسية",
    "كسوة تونسية",
    "أزياء تونسية تقليدية",
  ]
    .map((item) => trimString(item || ""))
    .filter(Boolean);

  this.seo = {
    slug: canonicalSlug,
    canonicalUrl,
    metaTitle: trimString(this.seo?.metaTitle || fallbackTitle).slice(0, 70),
    metaDescription: trimString(this.seo?.metaDescription || fallbackDescription).slice(0, 320),
    keywords: Array.from(
      new Set(
        (Array.isArray(this.seo?.keywords) && this.seo.keywords.length
          ? this.seo.keywords
          : keywordCandidates
        )
          .map((item) => trimString(item || ""))
          .filter(Boolean)
      )
    ).slice(0, 20),
    imageAlt: trimString(
      this.seo?.imageAlt ||
        `${fallbackTitle} - وهرة زمان - أزياء تونسية تقليدية فاخرة`
    ).slice(0, 180),
    ogTitle: trimString(this.seo?.ogTitle || this.seo?.metaTitle || fallbackTitle).slice(0, 70),
    ogDescription: trimString(
      this.seo?.ogDescription || this.seo?.metaDescription || fallbackDescription
    ).slice(0, 320),
  };

  next();
});

/* ---------- indexes ---------- */
ProductSchema.index({ updatedAt: -1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ productId: 1, category: 1, subCategory: 1 });
ProductSchema.index({ "seo.slug": 1 }, { unique: true, sparse: true });
ProductSchema.index({
  "seo.metaTitle": "text",
  "seo.metaDescription": "text",
  title: "text",
  description: "text",
});

export default mongoose.model("Product", ProductSchema);