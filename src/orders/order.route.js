// src/api/orders/order.route.js
const express = require("express");
const {
  createAOrder,
  getAllOrders,
  getOrderByEmail,
  getOrderById,
  updateOrder,
  deleteOrder,
  sendOrderNotification,
  removeProductFromOrder,
} = require("./order.controller");

const router = express.Router();

/**
 * Order matters:
 * - Put explicit paths BEFORE the param route "/:id" for the same HTTP verb.
 * - This prevents "/remove-product" from being captured as ":id".
 */

// Remove one product (or quantity) from an order
router.patch("/remove-product", removeProductFromOrder);

// Send a progress/ready notification email
router.post("/notify", sendOrderNotification);

// Collections
router.get("/", getAllOrders);
router.post("/", createAOrder);

// By email (specific before :id)
router.get("/email/:email", getOrderByEmail);

// By id
router.get("/:id", getOrderById);
router.patch("/:id", updateOrder);
router.delete("/:id", deleteOrder);

module.exports = router;
