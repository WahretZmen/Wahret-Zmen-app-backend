// Run from backend: node scripts/testMarketingSmtp.cjs
require('dotenv').config();
const nodemailer = require('nodemailer');
(async () => {
  const to = process.env.TELECOM_NOTIFICATION_EMAIL;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw Error('Invalid TELECOM_NOTIFICATION_EMAIL');
  const smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 12000,
  });
  await smtp.verify();
  const result = await smtp.sendMail({
    from: { name: process.env.MAIL_FROM_NAME || 'Wahret Zmen', address: process.env.MAIL_FROM || process.env.SMTP_USER },
    to,
    subject: 'Wahret Zmen - Test SMTP',
    text: 'Test de livraison OVH Mail Pro pour les notifications promotionnelles.',
  });
  console.log('SMTP accepted:', result.accepted, 'Message ID:', result.messageId);
})().catch(err => { console.error('SMTP TEST FAILED:', err.message); process.exitCode = 1; });
