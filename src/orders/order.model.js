// src/orders/order.model.js
const mongoose = require("mongoose");

/**
 * 🧾 Order Schema
 * ---------------------------------------
 * Captures customer info, address, line items, totals, and status flags.
 *
 * Notes:
 * - Each line item stores the unit `price` at time of purchase to preserve history.
 * - `color.colorName` is required in 3 locales (en/fr/ar) to match your i18n UI.
 * - `productProgress` is a map keyed by "productId|colorName" → percentage number.
 */

const OrderSchema = new mongoose.Schema(
  {
    // Customer
    name:  { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },

    // Address (normalized, all required)
    address: {
      street:  { type: String, required: true },
      city:    { type: String, required: true },
      state:   { type: String, required: true },
      country: { type: String, required: true },
      zipcode: { type: String, required: true },
    },

    // Line items
    products: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        quantity:  { type: Number, required: true },

        // Unit price captured at order time (not auto-updated with product changes)
        price:     { type: Number, required: true },

        // Selected color for this line (always present)
        color: {
          colorName: {
            en: { type: String, required: true },
            fr: { type: String, required: true },
            ar: { type: String, required: true },
          },
          image: { type: String, required: true },
        },
      },
    ],

    // Order totals / status
    totalPrice:   { type: Number, required: true },
    isPaid:       { type: Boolean, default: false },
    isDelivered:  { type: Boolean, default: false },

    /**
     * Production progress per line item.
     * Key format suggestion: "productId|colorName"
     * Value: percentage (0–100)
     */
    productProgress: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", OrderSchema);
module.exports = Order;
