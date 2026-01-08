// src/orders/order.model.js
const mongoose = require("mongoose");

/**
 * Order Schema (Arabic-only)
 * - Stores customer info, address, products, totals, and progress per line.
 */

const OrderSchema = new mongoose.Schema(
  {
    // Customer
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },

    // Address
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true },
      zipcode: { type: String, required: true },
    },

    // Line items
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true },

        // Unit price stored at time of order
        price: { type: Number, required: true },

        // Selected color (Arabic-only)
        color: {
          colorName: { type: String, required: true },
          image: { type: String, required: true },
        },

        // Snapshot (can stay string or object if you already store it like that)
        embroideryCategory: {
          type: mongoose.Schema.Types.Mixed,
          default: null,
        },
      },
    ],

    // Totals / status
    totalPrice: { type: Number, required: true },
    isPaid: { type: Boolean, default: false },
    isDelivered: { type: Boolean, default: false },

    // Key: "productId|colorName" => value: 0..100
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
