// src/orders/order.route.js
import express from "express";
import verifyAdminToken from "../middleware/verifyAdminToken.js";
import {
  createOrder, trackOrderByOrderId, getAllOrders, getOrderByEmail,
  getOrderById, updateOrder, deleteOrder, sendOrderNotification,
  removeProductFromOrder
} from "./order.controller.js";

const router = express.Router();
router.post("/", createOrder);
router.get("/track/:orderId", trackOrderByOrderId);

// All customer records and mutation endpoints must require admin auth.
router.get("/email/:email", verifyAdminToken, getOrderByEmail);
router.patch("/remove-product", verifyAdminToken, removeProductFromOrder);
router.post("/notify", verifyAdminToken, sendOrderNotification);
router.get("/", verifyAdminToken, getAllOrders);
router.get("/:id", verifyAdminToken, getOrderById);
router.patch("/:id", verifyAdminToken, updateOrder);
router.delete("/:id", verifyAdminToken, deleteOrder);
export default router;
