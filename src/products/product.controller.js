import { sendProductMarketingNotification } from "../ai/automaticMarketing.service.js";
// src/products/product.controller.js
import mongoose from "mongoose";
import Product from "../products/product.model.js";

/* -----------------------------------------------------------------------------
   Small helpers
----------------------------------------------------------------------------- */
const clampRating = (v) => Math.max(0, Math.min(5, Number.isFinite(+v) ? +v : 0));

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const normStr = (s) => String(s ?? "").trim();

const pickText = (v) => {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") return String(v.ar || v.fr || v.en || "").trim();
  return "";
};

const toLangObject = (v) => {
  if (!v) return { ar: "", fr: "", en: "" };
  if (typeof v === "string") {
    const txt = v.trim();
    return { ar: txt, fr: txt, en: txt };
  }
  return {
    ar: normStr(v?.ar),
    fr: normStr(v?.fr),
    en: normStr(v?.en),
  };
};

const formatProduct = (doc) => {
  if (!doc) return null;

  const product = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };

  return {
    ...product,
    id: product.productId || product._id?.toString?.() || "",
  };
};

const PROMO_OCCASIONS = ["ceremony", "party", "umrah", "hajj"];
const parsePromotion = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw Object.assign(new Error("Promotion rate must be between 0 and 100"), { status: 400 });
  return Math.round(n * 100) / 100;
};
const parseOccasions = (value) => {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(x => !PROMO_OCCASIONS.includes(x)))
    throw Object.assign(new Error("Invalid promotion occasion"), { status: 400 });
  return [...new Set(value)];
};

const MAIN_CATEGORIES = ["men", "women", "children"];

const ALLOWED_SUBCATEGORIES = [
  "accessories",
  "costume",
  "vest",
  "mens_abaya",
  "jebba",
  "keswa",
];

const SUBCATEGORY_INPUT_MAP = {
  accessories: "accessories",
  accessoires: "accessories",
  "إكسسوارات": "accessories",
  اكسسوارات: "accessories",
  costume: "costume",
  بدلة: "costume",
  vest: "vest",
  gilet: "vest",
  "صدريّة": "vest",
  صدريه: "vest",
  mens_abaya: "mens_abaya",
  "abaya homme": "mens_abaya",
  "عباية رجالي": "mens_abaya",
  "عباية رجالية": "mens_abaya",
  jebba: "jebba",
  "جبّة": "jebba",
  جبة: "jebba",
  keswa: "keswa",
  كسوة: "keswa",
};

const normalizeKey = (raw) => normStr(raw).toLowerCase().replace(/\s+/g, "_");

const ensureMainCategory = (raw) => {
  const key = normalizeKey(raw);
  if (!MAIN_CATEGORIES.includes(key)) return { ok: false, key };
  return { ok: true, key };
};

const normalizeSubCategory = (raw) => {
  const v = normStr(raw);
  if (!v) return "";
  const lowKey = normalizeKey(v);
  return SUBCATEGORY_INPUT_MAP[v] || SUBCATEGORY_INPUT_MAP[lowKey] || lowKey;
};

const ensureSubCategory = (raw) => {
  const key = normalizeSubCategory(raw);
  if (!key) return { ok: true, key: "" };
  if (!ALLOWED_SUBCATEGORIES.includes(key)) return { ok: false, key };
  return { ok: true, key };
};

const normalizeColors = (colors) => {
  let arr = colors;

  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [];
    }
  }

  const list = Array.isArray(arr) ? arr : [];

  return list
    .map((c) => {
      const images =
        Array.isArray(c?.images) && c.images.length
          ? c.images
          : c?.image
          ? [c.image]
          : [];

      const rawColorName = c?.colorName ?? c?.name ?? "";
      const colorName = toLangObject(rawColorName);

      return {
        ...(c?._id ? { _id: c._id } : {}),
        colorName,
        images: [...new Set(images.filter(Boolean))],
        image: images[0] || "",
        stock: Math.max(0, toNum(c?.stock, 0)),
      };
    })
    .filter((c) => Array.isArray(c.images) && c.images.length > 0);
};

const normalizeSizes = (sizes) => {
  let s = sizes;

  if (typeof s === "string") {
    try {
      s = JSON.parse(s);
    } catch {
      s = s.split(",").map((x) => x.trim());
    }
  }

  const list = Array.isArray(s) ? s : [];
  return list.map((x) => String(x).trim()).filter(Boolean);
};

const normalizePieces = (pieces) => {
  let arr = pieces;

  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [];
    }
  }

  const list = Array.isArray(arr) ? arr : [];

  return list
    .map((p) => {
      const name = normStr(p?.name);
      const rawPrice = p?.price;

      return {
        ...(p?._id ? { _id: p._id } : {}),
        name,
        price:
          rawPrice === "" || rawPrice === null || rawPrice === undefined
            ? null
            : Math.max(0, toNum(rawPrice, 0)),
      };
    })
    .filter((p) => p.name);
};

/**
 * POST /api/products/create-product
 */
const postAProduct = async (req, res) => {
  try {
    let {
      productId,
      title,
      description,
      category,
      subCategory,
      newPrice,
      oldPrice,
      promotionRate,
      colors,
      pieces,
      trending,
      coverImage,
      rating,
      embroideryCategory,
      translations,
      sizes,
      coupe,
      matiere,
      composition,
      madeIn,
      isHandmade,
    } = req.body;

    productId = normStr(productId);
    title = normStr(title);
    description = normStr(description);

    const catCheck = ensureMainCategory(category);
    if (!catCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Allowed: ${MAIN_CATEGORIES.join(", ")}`,
      });
    }
    category = catCheck.key;

    const subCheck = ensureSubCategory(subCategory);
    if (!subCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Invalid subCategory. Allowed: ${ALLOWED_SUBCATEGORIES.join(", ")} (or empty)`,
      });
    }
    subCategory = subCheck.key;

    const normalizedColors = normalizeColors(colors);
    const normalizedPieces = normalizePieces(pieces);

    const missing = [];
    if (!productId) missing.push("productId");
    if (!description) missing.push("description");
    if (!category) missing.push("category");
    if (!normalizedColors.length) missing.push("colors");

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const safeCover = normStr(coverImage) || normalizedColors[0]?.images?.[0] || "";
    if (!safeCover) {
      return res.status(400).json({
        success: false,
        message: "coverImage is required",
      });
    }

    const stockQuantity = normalizedColors.reduce((sum, c) => sum + (c.stock || 0), 0);

    const safeTranslations =
      translations && typeof translations === "object"
        ? {
            ar: {
              title: normStr(translations?.ar?.title),
              description: normStr(translations?.ar?.description),
            },
            fr: {
              title: normStr(translations?.fr?.title),
              description: normStr(translations?.fr?.description),
            },
            en: {
              title: normStr(translations?.en?.title),
              description: normStr(translations?.en?.description),
            },
          }
        : undefined;

    const product = await Product.create({
      productId,
      title,
      description,
      category,
      subCategory,
      coverImage: safeCover,
      colors: normalizedColors,
      pieces: normalizedPieces,
      promotionRate: parsePromotion(promotionRate),
      oldPrice:
        oldPrice === "" || oldPrice === null || oldPrice === undefined
          ? null
          : Math.max(0, toNum(oldPrice, 0)),
      newPrice:
        newPrice === "" || newPrice === null || newPrice === undefined
          ? null
          : Math.max(0, toNum(newPrice, 0)),
      stockQuantity,
      trending: !!trending,
      rating: clampRating(rating),
      embroideryCategory: toLangObject(embroideryCategory),
      sizes: normalizeSizes(sizes),
      coupe: toLangObject(coupe),
      matiere: toLangObject(matiere),
      composition: toLangObject(composition),
      madeIn: toLangObject(madeIn),
      isHandmade: !!isHandmade,
      ...(safeTranslations ? { translations: safeTranslations } : {}),
    });

    const campaignTypes = ["new_product"];
    if (Number(product.promotionRate || 0) > 0) {
      campaignTypes.push("promotion");
    }

    // Save the product first. Marketing failures must never turn a successful
    // product creation into an HTTP 500 (which could cause duplicate retries).
    const settled = await Promise.allSettled(
      campaignTypes.map((type) => sendProductMarketingNotification(product, type))
    );
    const marketingNotifications = Object.fromEntries(
      campaignTypes.map((type, index) => [
        type,
        settled[index].status === "fulfilled"
          ? settled[index].value
          : { status: "failed", reason: String(settled[index].reason?.message || settled[index].reason) },
      ])
    );
    const marketingNotification = marketingNotifications.new_product;
    console.info("[Product created marketing]", {
      productId: product.productId,
      promotionRate: product.promotionRate,
      campaigns: Object.fromEntries(
        Object.entries(marketingNotifications).map(([key, value]) => [key, {
          status: value?.status,
          stage: value?.stage,
          reason: value?.reason,
          emailSummary: value?.emailSummary,
        }])
      ),
    });

    return res.status(201).json({
      marketingNotification,
      marketingNotifications,
      campaignTypes,
      success: true,
      message: "Product created successfully",
      product: formatProduct(product),
    });
  } catch (error) {
    console.error("Error creating product:", error);
    if (error?.status === 400) return res.status(400).json({ success: false, message: error.message });

    if (error?.code === 11000 && error?.keyPattern?.productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID already exists. Please choose another one.",
      });
    }

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
    const products = await Product.find({})
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    return res.status(200).json(products.map(formatProduct).filter(Boolean));
  } catch (error) {
    console.error("Error fetching products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      products: [],
    });
  }
};

/**
 * GET /api/products/admin-lite
 */
const getAdminProductsLite = async (_req, res) => {
  try {
    const products = await Product.find(
      {},
      {
        productId: 1,
        coverImage: 1,
        colors: 1,
        category: 1,
        subCategory: 1,
        rating: 1,
        stockQuantity: 1,
        promotionRate: 1,
        pieces: 1,
        embroideryCategory: 1,
        createdAt: 1,
      }
    )
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    const formatted = products.map((product) => ({
      ...formatProduct(product),
      colors: Array.isArray(product.colors)
        ? product.colors.map((color) => ({
            _id: color?._id,
            colorName: color?.colorName || { ar: "", fr: "", en: "" },
            image:
              color?.image ||
              (Array.isArray(color?.images) && color.images[0]) ||
              "",
            images: Array.isArray(color?.images) ? color.images : [],
            stock: Math.max(0, Number(color?.stock || 0)),
          }))
        : [],
      pieces: Array.isArray(product.pieces)
        ? product.pieces.map((piece) => ({
            _id: piece?._id,
            name: normStr(piece?.name),
            price:
              piece?.price === null || piece?.price === undefined
                ? null
                : Math.max(0, Number(piece.price || 0)),
          }))
        : [],
      stockQuantity: Math.max(0, Number(product?.stockQuantity || 0)),
      rating: clampRating(product?.rating),
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("Error fetching admin lite products:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin lite products",
    });
  }
};

/**
 * GET /api/products/:productId
 */
const getSingleProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const normalizedProductId = normStr(productId);

    if (!normalizedProductId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    const orQueries = [
      { productId: normalizedProductId },
      { "seo.slug": normalizedProductId },
    ];

    if (mongoose.Types.ObjectId.isValid(normalizedProductId)) {
      orQueries.push({ _id: normalizedProductId });
    }

    const product = await Product.findOne({ $or: orQueries });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found!",
      });
    }

    return res.status(200).json(formatProduct(product));
  } catch (error) {
    console.error("Error fetching product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
};

/**
 * PUT /api/products/edit/:productId
 */
const updateProduct = async (req, res) => {
  try {
    const { productId: routeProductId } = req.params;
    const currentProductId = normStr(routeProductId);

    if (!currentProductId) {
      return res.status(400).json({
        success: false,
        message: "productId is required in route",
      });
    }

    let {
      productId,
      title,
      description,
      category,
      subCategory,
      newPrice,
      oldPrice,
      promotionRate,
      colors,
      pieces,
      trending,
      coverImage,
      rating,
      embroideryCategory,
      translations,
      sizes,
      coupe,
      matiere,
      composition,
      madeIn,
      isHandmade,
    } = req.body;

    const existing = await Product.findOne({ productId: currentProductId });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Product not found!",
      });
    }

    const catCheck = ensureMainCategory(category);
    if (!catCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Allowed: ${MAIN_CATEGORIES.join(", ")}`,
      });
    }
    category = catCheck.key;

    const subCheck = ensureSubCategory(subCategory);
    if (!subCheck.ok) {
      return res.status(400).json({
        success: false,
        message: `Invalid subCategory. Allowed: ${ALLOWED_SUBCATEGORIES.join(", ")} (or empty)`,
      });
    }
    subCategory = subCheck.key;

    description = normStr(description);
    if (!description) {
      return res.status(400).json({
        success: false,
        message: "description is required",
      });
    }

    if (productId !== undefined) {
      const nextProductId = normStr(productId);
      if (!nextProductId) {
        return res.status(400).json({
          success: false,
          message: "productId is required",
        });
      }
      existing.productId = nextProductId;
    }

    if (title !== undefined) existing.title = normStr(title);

    const normalizedColors =
      colors !== undefined ? normalizeColors(colors) : existing.colors;

    const normalizedPieces =
      pieces !== undefined ? normalizePieces(pieces) : existing.pieces || [];

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
      normalizedColors[0]?.image ||
      "";

    if (!safeCover) {
      return res.status(400).json({
        success: false,
        message: "coverImage is required",
      });
    }

    existing.description = description;
    existing.category = category;
    existing.subCategory = subCategory;
    existing.coverImage = safeCover;
    existing.colors = normalizedColors;
    existing.pieces = normalizedPieces;
    const previousPromotionRate = Number(existing.promotionRate || 0);
    existing.promotionRate = parsePromotion(promotionRate ?? existing.promotionRate);
    existing.oldPrice =
      oldPrice === "" || oldPrice === null || oldPrice === undefined
        ? null
        : Math.max(0, toNum(oldPrice, 0));
    existing.newPrice =
      newPrice === "" || newPrice === null || newPrice === undefined
        ? null
        : Math.max(0, toNum(newPrice, 0));
    existing.stockQuantity = normalizedColors.reduce(
      (sum, c) => sum + (c.stock || 0),
      0
    );
    existing.trending = !!trending;
    existing.rating = clampRating(rating);
    existing.embroideryCategory = toLangObject(embroideryCategory);
    existing.sizes = normalizeSizes(sizes);
    existing.coupe = toLangObject(coupe);
    existing.matiere = toLangObject(matiere);
    existing.composition = toLangObject(composition);
    existing.madeIn = toLangObject(madeIn);
    existing.isHandmade = !!isHandmade;

    if (translations && typeof translations === "object") {
      existing.translations = {
        ar: {
          title: normStr(translations?.ar?.title),
          description: normStr(translations?.ar?.description),
        },
        fr: {
          title: normStr(translations?.fr?.title),
          description: normStr(translations?.fr?.description),
        },
        en: {
          title: normStr(translations?.en?.title),
          description: normStr(translations?.en?.description),
        },
      };
    }

    await existing.save();
    // Each successful admin update of a product with an active promotion triggers
    // one AI-generated message to the configured test inbox. Unique campaign keys
    // prevent duplicate processing of the same saved version.
    const promotionActive = Number(existing.promotionRate || 0) > 0 &&
      previousPromotionRate !== Number(existing.promotionRate || 0);
    let marketingNotification = { status: "not_triggered", reason: "No promotion-rate change" };
    if (promotionActive) {
      try {
        marketingNotification = await sendProductMarketingNotification(existing, "promotion");
      } catch (marketingError) {
        console.error("[Promotion marketing]", marketingError);
        marketingNotification = { status: "failed", reason: marketingError.message };
      }
    }

    console.info("[Product updated marketing]", {
      productId: existing.productId,
      promotionActive,
      status: marketingNotification?.status,
      stage: marketingNotification?.stage,
      reason: marketingNotification?.reason,
      emailSummary: marketingNotification?.emailSummary,
    });
    return res.status(200).json({
      marketingNotification,
      success: true,
      message: "Product updated successfully",
      product: formatProduct(existing),
    });
  } catch (error) {
    console.error("Error updating product:", error);
    if (error?.status === 400) return res.status(400).json({ success: false, message: error.message });

    if (error?.code === 11000 && error?.keyPattern?.productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID already exists. Please choose another one.",
      });
    }

    const status = error?.name === "ValidationError" ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: error?.message || "Failed to update product",
    });
  }
};

/**
 * DELETE /api/products/:productId
 */
const deleteAProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const normalizedProductId = normStr(productId);

    if (!normalizedProductId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    const orQueries = [
      { productId: normalizedProductId },
      { "seo.slug": normalizedProductId },
    ];

    if (mongoose.Types.ObjectId.isValid(normalizedProductId)) {
      orQueries.push({ _id: normalizedProductId });
    }

    const deleted = await Product.findOneAndDelete({ $or: orQueries });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Product not found!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      product: formatProduct(deleted),
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};

/**
 * PUT /api/products/update-price/:productId
 */
const updateProductPriceByPercentage = async (req, res) => {
  try {
    const { productId } = req.params;
    const normalizedProductId = normStr(productId);
    const { percentage, target = "newPrice" } = req.body || {};

    const product = await Product.findOne({ productId: normalizedProductId });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found!",
      });
    }

    const pct = Number(percentage);
    if (!Number.isFinite(pct)) {
      return res.status(400).json({
        success: false,
        message: "percentage must be a valid number",
      });
    }

    const baseField = target === "oldPrice" ? "oldPrice" : "newPrice";
    const current = Number(product[baseField]);

    if (!Number.isFinite(current)) {
      return res.status(400).json({
        success: false,
        message: `${baseField} is not set for this product`,
      });
    }

    const updated = Math.max(0, current + current * (pct / 100));
    product[baseField] = Number(updated.toFixed(2));

    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product price updated successfully",
      product: formatProduct(product),
    });
  } catch (error) {
    console.error("Error updating product price:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product price",
    });
  }
};

export {
  postAProduct,
  getAllProducts,
  getAdminProductsLite,
  getSingleProduct,
  updateProduct,
  deleteAProduct,
  updateProductPriceByPercentage,
};