
// backend/src/ai/aiOrderTracking.route.js
// CommonJS router mounted at /api/ai/orders.
// Reuses the existing Mongoose Order model and MongoDB connection.

const express = require("express");
const mongoose = require("mongoose");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const router = express.Router();

router.use(express.json({ limit: "4kb" }));

const ORDER_ID_PATTERN = /^WZ-\d{4}-[A-Z0-9-]{4,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;

const attempts = new Map();

let orderModelPromise;

// Load existing Mongoose Order model.
function getOrderModel() {
  if (!orderModelPromise) {
    const url = pathToFileURL(
      path.resolve(__dirname, "../orders/order.model.js")
    ).href;

    orderModelPromise = import(url)
      .then((module) => module.default)
      .catch((error) => {
        orderModelPromise = undefined;
        throw error;
      });
  }

  return orderModelPromise;
}

// Basic rate limiting.
function rateLimit(req, res, next) {
  const now = Date.now();

  // Remove expired attempts.
  for (const [key, entry] of attempts) {
    if (entry.resetAt <= now) {
      attempts.delete(key);
    }
  }

  const key = req.ip || "unknown";

  const entry = attempts.get(key) || {
    count: 0,
    resetAt: now + WINDOW_MS,
  };

  entry.count += 1;
  attempts.set(key, entry);

  if (entry.count > MAX_ATTEMPTS) {
    res.set(
      "Retry-After",
      String(Math.ceil((entry.resetAt - now) / 1000))
    );

    return res.status(429).json({
      error:
        "Trop de tentatives. Réessayez dans quelques minutes.",
    });
  }

  next();
}

// Safely normalize multilingual values.
function asText(value, maxLength = 120) {
  if (typeof value === "string") {
    return value.trim().slice(0, maxLength);
  }

  if (value && typeof value === "object") {
    return asText(
      value.fr || value.ar || value.en || "",
      maxLength
    );
  }

  return "";
}

// Read product progress from existing order data.
function getProgress(progress, product, index) {
  const map =
    progress instanceof Map
      ? Object.fromEntries(progress)
      : progress || {};

  const candidates = [
    String(product.productId || ""),
    String(product._id || ""),
    String(index),
    `${
      product.productId || ""
    }|${asText(product.color?.colorName || product.color)}`,
  ];

  for (const key of candidates) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      continue;
    }

    const value = map[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return {
        progressStep: value,
        progressStatus: "",
      };
    }

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      const numeric = Number(value);

      if (Number.isFinite(numeric)) {
        return {
          progressStep: numeric,
          progressStatus: "",
        };
      }

      return {
        progressStep: null,
        progressStatus: asText(value, 100),
      };
    }
  }

  return {
    progressStep: null,
    progressStatus: "",
  };
}

// POST /api/ai/orders/track
router.post("/track", rateLimit, async (req, res) => {
  res.set("Cache-Control", "no-store");

  const orderId = String(
    req.body?.orderId || ""
  )
    .trim()
    .toUpperCase();

  const email = String(
    req.body?.email || ""
  )
    .trim()
    .toLowerCase();

  // Validate order ID and email.
  if (
    !ORDER_ID_PATTERN.test(orderId) ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email)
  ) {
    return res.status(400).json({
      error:
        "Saisissez une référence et une adresse e-mail valides.",
    });
  }

  // Check MongoDB connection.
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error:
        "Le suivi des commandes est temporairement indisponible.",
    });
  }

  try {
    const Order = await getOrderModel();

    // Retrieve saved order from MongoDB.
    const order = await Order.findOne({
      orderId,
    })
      .select(
        "orderId email status createdAt products totals total totalPrice productProgress carrier eta isDelivered"
      )
      .lean();

    // Verify customer email.
    // Return the same error for an invalid ID or email.
    if (
      !order ||
      String(order.email || "")
        .trim()
        .toLowerCase() !== email
    ) {
      return res.status(404).json({
        error:
          "Aucune commande ne correspond à ces informations.",
      });
    }

    // Normalize order products.
    const products = (
      Array.isArray(order.products)
        ? order.products
        : []
    )
      .slice(0, 40)
      .map((product, index) => {
        const progress = getProgress(
          order.productProgress,
          product,
          index
        );

        return {
          title: asText(product.title, 160),

          quantity: Number.isFinite(
            Number(product.quantity)
          )
            ? Number(product.quantity)
            : 1,

          color: asText(
            product.color?.colorName ||
              product.color,
            100
          ),

          size: asText(product.size, 50),

          progressStep: progress.progressStep,

          progressStatus:
            progress.progressStatus,
        };
      });

    // Support existing order total fields.
    const amount =
      order.totals?.total ??
      order.total ??
      order.totalPrice;

    const total =
      amount == null ? null : Number(amount);

    // Return restricted customer-facing data.
    return res.status(200).json({
      found: true,

      orderId: order.orderId,

      status:
        asText(order.status, 100) ||
        "pending",

      createdAt: order.createdAt || null,

      isDelivered: Boolean(
        order.isDelivered
      ),

      carrier: asText(order.carrier, 80),

      eta: asText(order.eta, 80),

      currency: "TND",

      total:
        total !== null &&
        Number.isFinite(total)
          ? total
          : null,

      products,
    });
  } catch (error) {
    console.error(
      "[Am Hssin] Order tracking failed:",
      error
    );

    return res.status(503).json({
      error:
        "Impossible de consulter la commande pour le moment.",
    });
  }
});

module.exports = router;
