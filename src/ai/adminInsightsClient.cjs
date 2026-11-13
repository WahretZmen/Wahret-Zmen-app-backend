"use strict";
/** For use by trusted server-side Admin AI tools, never by Public AI. */
const mongoose = require('mongoose');
function getAdminInsightsRouter() {
  return require('./adminInsights.route.cjs');
}
function assertAdminContext(ctx) {
  if (!ctx || ctx.role !== 'admin' || !ctx.adminId) {
    const err = new Error('Administrator authorization required');
    err.status = 403;
    throw err;
  }
}
function getAnalyticsCapability(ctx) {
  assertAdminContext(ctx);
  return { endpoint: '/api/ai/admin/insights/sales',
    supportedDays: [7, 30, 90],
    description: 'Read-only order statistics; does not provide SEO rankings or traffic analytics.' };
}
module.exports = { getAdminInsightsRouter, getAnalyticsCapability, assertAdminContext };
