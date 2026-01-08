// src/orders/order.route.js
const router = require("express").Router();
const {
  createOrder,
  getOrderByEmail,
  getOrderById,
  getAllOrders,
  updateOrder,
  deleteOrder,
  removeProductFromOrder,
  sendOrderNotification,
} = require("./order.controller.js");

/* ============================================================================
   🛒 Order Routes
   ---------------------------------------------------------------------------
   - POST   /           → Create a new order
   - GET    /           → Get all orders (admin)
   - GET    /email/:email → Get all orders for a specific customer email
   - GET    /:id        → Get a single order by ID
   - PATCH  /:id        → Update order flags or product progress
   - DELETE /:id        → Delete an order (restores stock)
   - POST   /remove-line → Remove/decrement a product line from an order
   - POST   /notify     → Send bilingual (FR/AR) progress notification
============================================================================ */

// Create order
router.post("/", createOrder);

// Fetch all orders (admin)
router.get("/", getAllOrders);

// Fetch orders by customer email
router.get("/email/:email", getOrderByEmail);

// Fetch single order by ID
router.get("/:id", getOrderById);

// Update order (isPaid, isDelivered, productProgress)
router.patch("/:id", updateOrder);

// Delete order
router.delete("/:id", deleteOrder);

// Remove or decrement a product line
router.post("/remove-line", removeProductFromOrder);

// Send progress notification email
router.post("/notify", sendOrderNotification);

module.exports = router;
