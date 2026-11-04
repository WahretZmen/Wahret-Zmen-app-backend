"use strict";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()\d\s.-]{6,24}$/;
const clean = (value) => typeof value === "string" ? value.trim() : "";
const within = (value, min, max) => value.length >= min && value.length <= max;
function readData(body) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  return { name: clean(b.name), email: clean(b.email).toLowerCase(), phone: clean(b.phone), subject: clean(b.subject), message: clean(b.message).replace(/\r\n?/g, "\n"), website: clean(b.website) };
}
function validate(data) {
  if (!data.name || !data.email || !data.subject || !data.message) return "Veuillez remplir tous les champs obligatoires.";
  if (!within(data.name, 2, 100)) return "Veuillez saisir un nom complet valide.";
  if (data.email.length > 254 || !EMAIL_PATTERN.test(data.email)) return "Veuillez saisir une adresse e-mail valide.";
  if (data.phone && !PHONE_PATTERN.test(data.phone)) return "Veuillez saisir un numéro de téléphone valide.";
  if (!within(data.subject, 3, 160)) return "L'objet doit contenir entre 3 et 160 caractères.";
  if (!within(data.message, 10, 5000)) return "Votre message doit contenir entre 10 et 5 000 caractères.";
  return null;
}
function makeNotification(data, escapeHtml) {
  const fields = [["Nom", data.name], ["E-mail", data.email], ["Téléphone", data.phone || "Non renseigné"], ["Objet", data.subject]];
  const text = ["NOUVEAU MESSAGE — WAHRET ZMEN", "", ...fields.map(([key, value]) => `${key} : ${value}`), "", "MESSAGE :", data.message].join("\n");
  const rows = fields.map(([key, value]) => `<tr><th align="left" style="padding:10px;border-bottom:1px solid #ddd">${escapeHtml(key)}</th><td style="padding:10px;border-bottom:1px solid #ddd">${escapeHtml(value)}</td></tr>`).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;background:#f6f6f6;padding:24px"><div style="max-width:640px;margin:auto;background:white;padding:24px"><h1>Wahret Zmen</h1><h2>Nouvelle demande client</h2><table style="width:100%;border-collapse:collapse">${rows}</table><h3>Message</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(data.message)}</p><p>Répondez à cet e-mail pour contacter le client.</p></div></body></html>`;
  return { subject: `Contact Wahret Zmen : ${data.subject}`, text, html };
}
function makeConfirmation(data, escapeHtml) {
  const text = `Bonjour ${data.name},\n\nNous vous remercions d'avoir contacté Wahret Zmen.\nVotre message a bien été reçu par notre équipe.\nNous vous répondrons dans les meilleurs délais.\n\nL'équipe Wahret Zmen\nhttps://www.wahretzmen.com`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;padding:24px"><h1>Wahret Zmen</h1><p>Bonjour ${escapeHtml(data.name)},</p><p>Nous vous remercions d'avoir contacté Wahret Zmen.</p><p>Votre message a bien été reçu par notre équipe.</p><p>Nous vous répondrons dans les meilleurs délais.</p><p>L'équipe Wahret Zmen</p></body></html>`;
  return { subject: "Confirmation de réception de votre message — Wahret Zmen", text, html };
}
async function sendContactEmail(req, res) {
  try {
    const data = readData(req.body);
    if (data.website) return res.status(200).json({ success: false, message: "Votre demande a été prise en compte." });
    const issue = validate(data);
    if (issue) return res.status(400).json({ success: false, message: issue });
    const mail = await import("../services/mail.service.js");
    const recipient = process.env.MAIL_TO?.trim();
    if (!recipient) throw new Error("MAIL_TO is not configured");
    const info = await mail.sendProfessionalMail({ to: recipient, ...makeNotification(data, mail.escapeHtml), replyTo: data.email });
    if (!Array.isArray(info?.accepted) || info.accepted.length === 0) throw new Error("SMTP did not accept the notification recipient");
    if (String(process.env.CONTACT_AUTO_REPLY ?? "true").toLowerCase() === "true") {
      try {
        await mail.sendProfessionalMail({ to: data.email, ...makeConfirmation(data, mail.escapeHtml), replyTo: process.env.MAIL_FROM || process.env.SMTP_USER });
      } catch (err) { console.error("[CONTACT] Customer confirmation failed", { code: err.code, message: err.message }); }
    }
    return res.status(200).json({ success: true, message: "Votre message a été envoyé avec succès. Nous vous répondrons dans les meilleurs délais." });
  } catch (err) {
    console.error("[CONTACT] Main notification failed", { code: err.code, command: err.command, responseCode: err.responseCode, message: err.message });
    return res.status(500).json({ success: false, message: "Impossible d'envoyer votre message pour le moment. Veuillez réessayer ultérieurement." });
  }
}
module.exports = { sendContactEmail };
