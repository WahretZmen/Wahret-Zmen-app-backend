// backend/src/ai/progressNotifications.routes.js
// Mount ONLY behind your existing JWT admin middleware. Never expose publicly.
const { Router } = require('express');
const mongoose = require('mongoose');
const orderModule = require('../orders/order.model.js');
const Order = orderModule.default || orderModule.Order || orderModule;
// Mail module loaded lazily to support CommonJS and ESM mail.service.js.
async function sendProfessionalMail(payload) {
  const mod = await import('../services/mail.service.js');
  const fn = mod.sendProfessionalMail || mod.default?.sendProfessionalMail || mod.sendMail;
  if (typeof fn !== 'function') throw new Error('Mail service export missing');
  return fn(payload);
}

const router = Router();
const getSabriPhone = () => String(process.env.SABRI_WHATSAPP || '21654453384').replace(/\D/g, '');
const AI_URL = (process.env.AI_SERVICE_URL || process.env.AM_HSSIN_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const getAdminEmail = () => process.env.MAIL_TO;
const getMailFrom = () => process.env.MAIL_FROM || process.env.SMTP_USER;
const VALID_PHONE = /^216\d{8}$/;
const clean = (x, max = 120) => String(x ?? '').trim().slice(0, max);
const productId = (p) => clean(p?.productId?._id || p?.productId || p?._id);
const formatPhone = (value) => {
  const d = String(value || '').replace(/\D/g, '');
  if (/^216\d{8}$/.test(d)) return d;
  if (/^\d{8}$/.test(d)) return '216' + d;
  return '';
};

async function context(req, res) {
  const { orderId, productKey, progress } = req.body || {};
  if (!mongoose.isValidObjectId(orderId) || typeof productKey !== 'string' || productKey.length > 240 || ![60, 100].includes(Number(progress))) {
    res.status(400).json({ message: 'Invalid notification request' }); return null;
  }
  const order = await Order.findById(orderId).lean();
  if (!order) { res.status(404).json({ message: 'Order not found' }); return null; }
  const actual = order.productProgress instanceof Map ? order.productProgress.get(productKey) : order.productProgress?.[productKey];
  if (Number(actual) !== Number(progress)) { res.status(409).json({ message: 'Milestone not saved' }); return null; }
  const match = (order.products || []).find(p => productKey.startsWith(productId(p) + '|'));
  if (!match) { res.status(422).json({ message: 'Product not found in order' }); return null; }
  const suffix = productKey.split('|').slice(2).join('|');
  const ids = suffix.split('-').map(Number);
  const selected = Array.isArray(match.selectedPieces) && match.selectedPieces.length ? match.selectedPieces : match.pieces || [];
  const piece = selected.length ? selected[ids[1]] : null;
  if (selected.length && !piece) { res.status(422).json({ message: 'Piece not found' }); return null; }
  return { order, match, piece, progress: Number(progress), productKey, orderRef: clean(order.orderId || order._id),
    pieceName: clean(piece?.name || 'Pièce') + ' n°' + (Number.isInteger(ids[2]) ? ids[2] + 1 : Number.isInteger(ids[1]) ? ids[1] + 1 : 1) };
}

async function compose(c, timeoutMs = 14000) {
  const response = await fetch(`${AI_URL}/internal/progress-copy`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-AI-Key': process.env.INTERNAL_AI_KEY || '' },
    body: JSON.stringify({ order_ref: c.orderRef, customer_name: clean(c.order.name), product_ref: productId(c.match),
      category: clean(c.match.category), piece_name: c.pieceName, progress: c.progress }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Am Hssin AI HTTP ${response.status}: ${detail.slice(0, 220)}`);
  }
  const draft = await response.json();
  const fields = ['customer_whatsapp', 'admin_whatsapp', 'customer_email_subject', 'customer_email_text', 'admin_email_subject', 'admin_email_text'];
  if (fields.some(key => typeof draft?.[key] !== 'string' || !draft[key].trim())) {
    throw new Error('Am Hssin returned an incomplete AI draft');
  }
  return draft;
}

// Never silently substitute a fixed template for an AI-generated message.
// An AI outage is reported to the admin instead of masquerading as AI output.

// WhatsApp click: Am Hssin writes the message; user manually presses Send.
router.post('/whatsapp', async (req, res) => {
  try {
    const c = await context(req, res); if (!c) return;
    const recipient = req.body.recipient;
    if (!['customer', 'admin'].includes(recipient)) return res.status(400).json({ message: 'Invalid recipient' });
    const phone = recipient === 'admin' ? getSabriPhone() : formatPhone(c.order.phone);
    if (!VALID_PHONE.test(phone)) return res.status(422).json({ message: 'Invalid WhatsApp number' });
    const draft = await compose(c, 14000);
    const message = recipient === 'admin' ? draft.admin_whatsapp : draft.customer_whatsapp;
    return res.json({ url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, source: 'ai', recipient });
  } catch (err) { console.error('[Progress WhatsApp AI]', err); return res.status(503).json({ message: `Message IA non généré : ${err.message || 'service indisponible'}`, source: 'error' }); }
});

// Each email button sends to exactly one recipient. AI drafts the copy;
// the existing professional SMTP mail service delivers it.
router.post('/email', async (req, res) => {
  try {
    const c = await context(req, res); if (!c) return;
    const recipient = req.body?.recipient;
    if (!['customer', 'admin'].includes(recipient)) {
      return res.status(400).json({ message: 'Invalid email recipient' });
    }
    const address = recipient === 'admin' ? getAdminEmail() : c.order.email;
    if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return res.status(422).json({ message: `${recipient} email not configured or invalid` });
    }
    if (!getMailFrom()) return res.status(503).json({ message: 'MAIL_FROM not configured' });
    const draft = await compose(c, 14000);
    const subject = recipient === 'admin' ? draft.admin_email_subject : draft.customer_email_subject;
    const body = recipient === 'admin' ? draft.admin_email_text : draft.customer_email_text;
    if (typeof subject !== 'string' || !subject.trim() || typeof body !== 'string' || !body.trim()) {
      return res.status(502).json({ message: 'Am Hssin returned an incomplete email draft' });
    }
    await sendProfessionalMail({ to: address, subject, text: body });
    return res.json({ results: { customer: recipient === 'customer', admin: recipient === 'admin' }, failures: [], source: 'ai' });
  } catch (err) {
    console.error('[Progress Email]', err);
    return res.status(503).json({ message: err?.name === 'TimeoutError' ? 'Am Hssin email drafting timed out' : (err.message || 'Email notification unavailable') });
  }
});

module.exports = router;
