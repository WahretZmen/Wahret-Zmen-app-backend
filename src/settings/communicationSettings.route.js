'use strict';
const express = require('express');
const Settings = require('./communicationSettings.model.js');
const { validateSettings, readCommunicationSettings } = require('./communicationSettings.service.js');
const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// Auth and MongoDB middleware are applied in backend/index.js before mounting this router.
router.get('/', async (_req, res) => {
  try { return res.json(await readCommunicationSettings()); }
  catch (error) {
    console.error('[Communication Settings GET]', error?.message);
    return res.status(503).json({ message: 'Impossible de charger les paramètres.' });
  }
});
router.put('/', async (req, res) => {
  try {
    const validated = validateSettings(req.body);
    const adminId = String(req.admin?._id || req.admin?.id || req.user?._id || req.user?.id || 'admin');
    const doc = await Settings.findOneAndUpdate(
      { key: 'main' },
      { $set: { ...validated, updatedBy: adminId }, $setOnInsert: { key: 'main' } },
      { upsert: true, new: true, runValidators: true }
    );
    return res.json({
      newMessages: doc.newMessages,
      promotions: doc.promotions,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'Conflit de sauvegarde. Réessayez.' });
    console.error('[Communication Settings PUT]', error?.message);
    return res.status(error?.status === 400 ? 400 : 503).json({
      message: error?.status === 400 ? error.message : 'Impossible de sauvegarder les paramètres.',
    });
  }
});
module.exports = router;
