'use strict';
const Settings = require('./communicationSettings.model.js');
const MAX_RECIPIENTS = 40;
const SECTIONS = ['newMessages', 'promotions'];
const emptySection = () => ({ emails: [], phones: [] });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9][0-9\s().-]{6,23}$/;
function validateList(value, kind) {
  if (!Array.isArray(value) || value.length > MAX_RECIPIENTS) {
    const err = new Error(`Maximum ${MAX_RECIPIENTS} ${kind} par section.`); err.status = 400; throw err;
  }
  const values = [...new Set(value.map(v => String(v ?? '').trim()).filter(Boolean))];
  if (values.some(v => v.length > 254 || !(kind === 'emails' ? emailPattern : phonePattern).test(v))) {
    const err = new Error(`Destinataire invalide (${kind}).`); err.status = 400; throw err;
  }
  return values;
}
function validateSettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('Paramètres invalides.'); err.status = 400; throw err;
  }
  const output = {};
  for (const section of SECTIONS) {
    if (!body[section] || typeof body[section] !== 'object') {
      const err = new Error(`Section manquante : ${section}`); err.status = 400; throw err;
    }
    output[section] = {
      emails: validateList(body[section].emails, 'emails'),
      phones: validateList(body[section].phones, 'phones'),
    };
  }
  return output;
}
async function readCommunicationSettings() {
  const doc = await Settings.findOne({ key: 'main' }).lean();
  return {
    newMessages: { ...emptySection(), ...(doc?.newMessages || {}) },
    promotions: { ...emptySection(), ...(doc?.promotions || {}) },
    updatedAt: doc?.updatedAt || null,
  };
}
async function getNotificationEmails(section = 'newMessages') {
  if (!SECTIONS.includes(section)) throw new Error('Invalid notification section');
  const settings = await readCommunicationSettings();
  return settings[section].emails;
}
async function getNotificationPhones(section = 'newMessages') {
  if (!SECTIONS.includes(section)) throw new Error('Invalid notification section');
  const settings = await readCommunicationSettings();
  return settings[section].phones;
}
module.exports = { validateSettings, readCommunicationSettings, getNotificationEmails, getNotificationPhones };
