'use strict';
const mongoose = require('mongoose');
const recipients = () => ({
  emails: { type: [String], default: [] },
  phones: { type: [String], default: [] },
});
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'main', immutable: true },
  newMessages: recipients(),
  promotions: recipients(),
  updatedBy: { type: String, default: '' },
}, { timestamps: true });
module.exports = mongoose.models.CommunicationSettings || mongoose.model('CommunicationSettings', schema);
