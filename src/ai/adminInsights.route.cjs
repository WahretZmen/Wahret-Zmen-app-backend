"use strict";
/** Read-only sales analytics. MUST be mounted behind verified admin auth. */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const COMPLETE_STATUS = 'تم التسليم والدفع';
const MAX_ROWS = 10000;
const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;
const validAmount = (v) => Number.isFinite(Number(v)) && Number(v) >= 0;
const asId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
};
const itemsFrom = (order) => Array.isArray(order.products) ? order.products :
  Array.isArray(order.items) ? order.items : Array.isArray(order.orderItems) ? order.orderItems : [];
const amountFrom = (order) => {
  for (const value of [order.totals?.total, order.totalPrice, order.total, order.totalAmount]) {
    if (value !== null && value !== undefined && validAmount(value)) return Number(value);
  }
  return null;
};
const completedFrom = (order) => order.status === COMPLETE_STATUS ||
  (order.isPaid === true && order.isDelivered === true);
router.get('/sales', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const rawDays = req.query.days === undefined ? '30' : req.query.days;
  if (typeof rawDays !== 'string' || !/^(?:[1-9]|[1-9][0-9]{1,2})$/.test(rawDays))
    return res.status(400).json({ success: false, message: 'days must be an integer from 1 to 365' });
  const days = Number(rawDays);
  if (days < 1 || days > 365) return res.status(400).json({ success: false, message: 'days must be 1..365' });
  if (mongoose.connection.readyState !== 1)
    return res.status(503).json({ success: false, message: 'Database unavailable' });
  try {
    const Order = mongoose.models.Order;
    if (!Order) return res.status(503).json({ success: false, message: 'Order model not registered' });
    const since = new Date(Date.now() - days * 86400000);
    const orders = await Order.find({ createdAt: { $gte: since } })
      .select('createdAt status isPaid isDelivered products items orderItems totals.total totalPrice total totalAmount')
      .sort({ createdAt: -1 }).limit(MAX_ROWS + 1).lean();
    const truncated = orders.length > MAX_ROWS;
    const sample = orders.slice(0, MAX_ROWS);
    const productStats = new Map();
    let completedOrders = 0, completedOrderValue = 0, missingOrderTotals = 0;
    for (const order of sample) {
      const completed = completedFrom(order);
      if (completed) {
        completedOrders++;
        const amount = amountFrom(order);
        if (amount === null) missingOrderTotals++;
        else completedOrderValue += amount;
      }
      for (const line of itemsFrom(order)) {
        const id = asId(line.productId || line.product || line.product_id);
        const quantity = Number(line.quantity ?? line.qty ?? 0);
        if (!id || !Number.isFinite(quantity) || quantity <= 0) continue;
        const row = productStats.get(id) || { productId: id, orderedUnits: 0, completedUnits: 0 };
        row.orderedUnits += quantity;
        if (completed) row.completedUnits += quantity;
        productStats.set(id, row);
      }
    }
    return res.json({
      success: true, periodDays: days, ordersAnalyzed: sample.length, truncated,
      ordersPlaced: sample.length, ordersCompleted: completedOrders,
      completedOrderValueTND: missingOrderTotals ? null : roundMoney(completedOrderValue),
      completedOrdersMissingTotals: missingOrderTotals,
      completionRatePercent: sample.length ? roundMoney(completedOrders / sample.length * 100) : null,
      topProducts: [...productStats.values()].sort((a,b) => b.completedUnits - a.completedUnits).slice(0,15),
      limitations: [
        'Validate field mappings against the production Order schema before using results for decisions.',
        'Completed order value is not proof of COD cash settlement.',
        'Product IDs may be unavailable when order items store snapshots without product references.',
        'The newest 10000 orders are sampled; truncated=true means incomplete statistics.',
        'Traffic, SEO rankings, and website conversion rates require separate verified analytics sources.'
      ]
    });
  } catch (error) {
    console.error('[Admin insights] query failed:', error?.message || 'unknown error');
    return res.status(500).json({ success: false, message: 'Unable to calculate sales insights' });
  }
});
module.exports = router;
