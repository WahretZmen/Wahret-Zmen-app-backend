const mongoose = require("mongoose");

// ✅ Color schema with multilingual colorName and stock per color
const ColorSchema = new mongoose.Schema({
  colorName: {
    en: { type: String, required: true },
    fr: { type: String, required: true },
    ar: { type: String, required: true },
  },
  image: { type: String, required: true },
  stock: { type: Number, required: true, default: 0 }, // ✅ Stock per color
});

// ✅ Product schema
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
    coverImage: { type: String, required: true },

    colors: {
      type: [ColorSchema],
      required: true,
    },

    oldPrice: { type: Number, required: true },
    newPrice: { type: Number, required: true },

    // 🟡 Optional global stock (can be calculated or removed)
    stockQuantity: { type: Number, required: true },

    trending: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);
