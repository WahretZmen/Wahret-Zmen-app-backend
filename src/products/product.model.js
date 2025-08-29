const mongoose = require("mongoose");

// ✅ Color schema now supports MULTIPLE images
const ColorSchema = new mongoose.Schema({
  colorName: {
    en: { type: String, required: true },
    fr: { type: String, required: true },
    ar: { type: String, required: true },
  },
  // was `image: String`
  images: {
    type: [String],
    required: true,
    validate: (arr) => Array.isArray(arr) && arr.length > 0,
  },
  stock: { type: Number, required: true, default: 0 },
});

const ProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },

    translations: {
      en: { title: String, description: String },
      fr: { title: String, description: String },
      ar: { title: String, description: String },
    },

    category: { type: String, required: true },

    // keep a single cover for listings; we’ll set it to the first image of first color if not provided
    coverImage: { type: String, required: true },

    colors: { type: [ColorSchema], required: true },

    oldPrice: { type: Number, required: true },
    newPrice: { type: Number, required: true },

    stockQuantity: { type: Number, required: true },
    trending: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);
