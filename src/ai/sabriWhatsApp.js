import AiCheckout from './aiCheckout.model.js';
import Order from '../orders/order.model.js';

// Official Meta Cloud API only. An approved template must exist on the account.
// Use template variables in the exact order of the approved template.
export async function notifySabriForCheckout(checkoutId) {
  const checkout = await AiCheckout.findById(checkoutId);
  if (!checkout || checkout.status !== 'completed' || checkout.notification.status === 'sent') return;
  const { WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, SABRI_WHATSAPP_TO, WHATSAPP_ORDER_TEMPLATE, WHATSAPP_TEMPLATE_LANGUAGE = 'fr' } = process.env;
  if (![WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, SABRI_WHATSAPP_TO, WHATSAPP_ORDER_TEMPLATE].every(Boolean)) {
    checkout.notification.status = 'disabled'; await checkout.save(); return;
  }
  const order = await Order.findById(checkout.orderMongoId).lean();
  if (!order) throw new Error('Order missing for notification');
  const itemSummary = (order.products || []).map(p => `${p.title || p.productId} [${p.productId}] x${p.quantity}`).join(' | ').slice(0, 900);
  const address = [order.address?.street, order.address?.city, order.address?.state, order.address?.zipcode].filter(Boolean).join(', ');
  const vars = [order.orderId, order.name, order.phone, address, itemSummary, Number(order.total || 0).toFixed(2) + ' TND', 'COD'];
  try {
    const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: SABRI_WHATSAPP_TO, type: 'template',
        template: { name: WHATSAPP_ORDER_TEMPLATE, language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [{ type: 'body', parameters: vars.map(text => ({ type: 'text', text: String(text) })) }] } })
    });
    if (!response.ok) throw new Error(`WhatsApp HTTP ${response.status}`);
    checkout.notification.status = 'sent'; checkout.notification.lastError = '';
  } catch (error) {
    checkout.notification.status = 'failed';
    checkout.notification.lastError = String(error?.message || 'send failed').slice(0, 150);
    checkout.notification.nextAttemptAt = new Date(Date.now() + Math.min(60, 2 ** Math.min(checkout.notification.attempts, 6)) * 60_000);
  }
  checkout.notification.attempts += 1;
  await checkout.save();
}

// Call this from a secured background worker or cron, NOT a public route.
export async function retryPendingSabriNotifications(limit = 20) {
  const due = await AiCheckout.find({ status: 'completed', 'notification.status': { $in: ['pending','failed','disabled'] }, 'notification.nextAttemptAt': { $lte: new Date() }, 'notification.attempts': { $lt: 8 } }).limit(limit).select('_id');
  for (const row of due) await notifySabriForCheckout(row._id);
}
