// src/orders/order.model.js //
import mongoose from "mongoose";

const { Schema } = mongoose;

export const ORDER_PRODUCT_STATUSES = [
  "تم تأكيد الطلب",
  "قيد التحضير",
  "خارج للتسليم",
  "تم التسليم والدفع",
];

const OrderPieceSchema = new Schema(
  {
    key: { type: String, default: "", trim: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: null, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const OrderProductLineSchema = new Schema(
  {
    productId: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 1, min: 1 },

    color: {
      colorName: { type: Schema.Types.Mixed, default: "" },
      image: { type: String, default: "" },
      images: { type: [String], default: [] },
    },

    size: { type: String, default: "" },

    price: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    newPrice: { type: Number, default: 0, min: 0 },

    title: { type: String, default: "" },
    coverImage: { type: String, default: "" },
    embroideryCategory: { type: Schema.Types.Mixed, default: "" },

    category: { type: String, default: "", trim: true },
    subCategory: { type: String, default: "", trim: true },

    pieces: { type: [OrderPieceSchema], default: [] },
    selectedPieces: { type: [OrderPieceSchema], default: [] },

    colorKey: { type: String, default: "" },
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    orderId: { type: String, trim: true, index: true, default: "" },

    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "", index: true },
    phone: { type: String, trim: true, default: "" },

    address: {
      street: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "Tunisia" },
      zipcode: { type: String, trim: true, default: "" },
    },

    products: { type: [OrderProductLineSchema], default: [] },

    paymentMethod: { type: String, default: "cod" },
    payment: {
      method: { type: String, default: "cod" },
    },

    totals: {
      subtotal: { type: Number, default: 0, min: 0 },
      shipping: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 0, min: 0 },
    },

    subtotal: { type: Number, default: 0, min: 0 },
    shipping: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },

    carrier: { type: String, trim: true, default: "" },
    eta: { type: String, trim: true, default: "" },

    status: { type: String, trim: true, default: "pending" },

    isPaid: { type: Boolean, default: false },
    isDelivered: { type: Boolean, default: false },

    productProgress: {
      type: Map,
      of: Number,
      default: {},
    },

    note: { type: String, trim: true, default: "" },
    comment: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Order", OrderSchema);