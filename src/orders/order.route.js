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

router.post("/", createOrder);
router.get("/", getAllOrders);
router.get("/email/:email", getOrderByEmail);
router.get("/:id", getOrderById);
router.patch("/:id", updateOrder);
router.delete("/:id", deleteOrder);
router.post("/remove-line", removeProductFromOrder);
router.post("/notify", sendOrderNotification);

module.exports = router;
