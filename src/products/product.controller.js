// src/products/product.controller.js
// Product CRUD (Arabic-only data)

const Product = require("./product.model");

// ---------- small helpers ----------
const clampRating = (v) =>
  Math.max(0, Math.min(5, Number.isFinite(+v) ? +v : 0));

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const normStr = (s) => String(s ?? "").trim();

// Accept string OR old object shapes {ar/fr/en} and return a string
const pickText = (v) => {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") return String(v.ar || v.fr || v.en || "").trim();
  return "";
};

// Normalize incoming colors
const normalizeColors = (colors) => {
  const arr = Array.isArray(colors) ? colors : [];
  return arr
    .map((c) => {
      const images =
        Array.isArray(c?.images) && c.images.length
          ? c.images
          : c?.image
          ? [c.image]
          : [];

      return {
        // store as Arabic string (or whatever user typed)
        colorName: pickText(c?.colorName) || pickText(c?.name) || "افتراضي",
        images: [...new Set(images.filter(Boolean))],
        stock: Math.max(0, toNum(c?.stock, 0)),
      };
    })
    .filter((c) => c.images.length > 0);
};

// ---------- controllers ----------

/**
 * POST /api/products
 */
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
      rating,
      embroideryCategory,
    } = req.body;

    title = normStr(title);
    description = normStr(description);
    category = normStr(category);

    const normalizedColors = normalizeColors(colors);

    const missing = [];
    if (!title) missing.push("title");
    if (!description) missing.push("description");
    if (!category) missing.push("category");
    if (newPrice === undefined) missing.push("newPrice");
    if (oldPrice === undefined) missing.push("oldPrice");
    if (!normalizedColors.length) missing.push("colors");

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const safeCover =
      normStr(coverImage) || normalizedColors[0]?.images?.[0] || "";
    if (!safeCover) {
      return res
        .status(400)
        .json({ success: false, message: "coverImage is required" });
    }

    const stockQuantity = normalizedColors.reduce(
      (sum, c) => sum + (c.stock || 0),
      0
    );

    const product = await Product.create({
      title,
      description,
      category,
      coverImage: safeCover,
      colors: normalizedColors,
      oldPrice: Math.max(0, toNum(oldPrice, 0)),
      newPrice: Math.max(0, toNum(newPrice, 0)),
      stockQuantity,
      trending: !!trending,
      rating: clampRating(rating),
      embroideryCategory: pickText(embroideryCategory),
    });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    const status = error?.name === "ValidationError" ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to create product",
    });
  }
};

/**
 * GET /api/products
 */
const getAllProducts = async (_req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch products" });
  }
};

/**
 * GET /api/products/:id
 */
const getSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found!" });
    }
    return res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch product" });
  }
};

/**
 * PUT /api/products/edit/:id
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    let {
      title,
      description,
      category,
      newPrice,
      oldPrice,
      colors,
      trending,
      coverImage,
      rating,
      embroideryCategory,
    } = req.body;

    const existing = await Product.findById(id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found!" });
    }

    title = normStr(title);
    description = normStr(description);
    category = normStr(category);

    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: "title, description and category are required",
      });
    }

    const normalizedColors =
      colors !== undefined ? normalizeColors(colors) : existing.colors;

    if (!Array.isArray(normalizedColors) || normalizedColors.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one color must be provided.",
      });
    }

    const safeCover =
      normStr(coverImage) ||
      existing.coverImage ||
      normalizedColors[0]?.images?.[0] ||
      "";

    if (!safeCover) {
      return res
        .status(400)
        .json({ success: false, message: "coverImage is required" });
    }

    existing.title = title;
    existing.description = description;
    existing.category = category;
    existing.coverImage = safeCover;

    // Update colors only if sent
    if (colors !== undefined) {
      existing.colors = normalizedColors;
      existing.stockQuantity = normalizedColors.reduce(
        (sum, c) => sum + (c.stock || 0),
        0
      );
    }

    if (oldPrice !== undefined) existing.oldPrice = Math.max(0, toNum(oldPrice, existing.oldPrice));
    if (newPrice !== undefined) existing.newPrice = Math.max(0, toNum(newPrice, existing.newPrice));
    if (trending !== undefined) existing.trending = !!trending;
    if (rating !== undefined) existing.rating = clampRating(rating);

    // embroideryCategory: string only (empty string clears)
    if (embroideryCategory !== undefined) {
      const txt = pickText(embroideryCategory);
      existing.embroideryCategory = txt ? txt : "";
    }

    await existing.save();

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: existing,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    const status = error?.name === "ValidationError" ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to update product",
    });
  }
};

/**
 * DELETE /api/products/:id
 */
const deleteAProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await Product.findByIdAndDelete(id);
    if (!deletedProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found!" });
    }
    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      product: deletedProduct,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete product" });
  }
};

/**
 * PUT /api/products/update-price/:id
 * body: { percentage: number }
 */
const updateProductPriceByPercentage = async (req, res) => {
  const { id } = req.params;
  const { percentage } = req.body;

  try {
    const p = await Product.findById(id);
    if (!p) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found!" });
    }

    const pct = toNum(percentage, 0);
    const discount = (toNum(p.oldPrice, 0) * pct) / 100;
    const finalPrice = Math.max(0, toNum(p.oldPrice, 0) - discount);

    p.newPrice = finalPrice;
    await p.save();

    return res.status(200).json({
      success: true,
      message: "Price updated successfully",
      finalPrice,
      product: p,
    });
  } catch (error) {
    console.error("Error updating product price:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product price",
    });
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
