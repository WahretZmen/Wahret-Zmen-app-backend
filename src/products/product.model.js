const mongoose = require("mongoose");

/* Color schema: one entry per color with i18n name + images + stock */
const ColorSchema = new mongoose.Schema({
  colorName: {
    en: { type: String, required: true },
    fr: { type: String, required: true },
    ar: { type: String, required: true },
  },
  images: {
    type: [String],
    required: true,
    validate: (arr) => Array.isArray(arr) && arr.length > 0,
  },
  stock: { type: Number, required: true, default: 0 },
});

/* Main product schema */
const ProductSchema = new mongoose.Schema(
  {
    // Base texts (FR as main source in your app)
    title: { type: String, required: true },
    description: { type: String, required: true },

    // Translations for UI
    translations: {
      en: { title: String, description: String },
      fr: { title: String, description: String },
      ar: { title: String, description: String },
    },

    // Main category (Men / Women / Children)
    category: { type: String, required: true },

    // 🧵 Embroidery category stored as multi-lang object
    // e.g. { en: "Tulle embroidery", fr: "Broderie tulle", ar: "تطريز التل" }
    embroideryCategory: {
      en: { type: String, trim: true },
      fr: { type: String, trim: true },
      ar: { type: String, trim: true },
    },

    // One main image used in cards/lists
    coverImage: { type: String, required: true },

    // Color variants with their own galleries
    colors: { type: [ColorSchema], required: true },

    // Pricing
    oldPrice: { type: Number, required: true },
    newPrice: { type: Number, required: true },

    // Total stock (sum of color stocks)
    stockQuantity: { type: Number, required: true },

    // Flags
    trending: { type: Boolean, default: false },

    // Admin rating (0..5)
    rating: { type: Number, default: 0, min: 0, max: 5 },
  },
  { timestamps: true }
);

/* If coverImage missing, fall back to first color's first image */
ProductSchema.pre("validate", function (next) {
  if (!this.coverImage && Array.isArray(this.colors) && this.colors.length > 0) {
    const first = this.colors[0]?.images?.[0];
    if (first) this.coverImage = first;
  }
  next();
});

/* Safe export (avoid model overwrite in dev) */
module.exports =
  mongoose.models.Product || mongoose.model("Product", ProductSchema);
