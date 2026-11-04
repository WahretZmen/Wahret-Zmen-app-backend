import mongoose from 'mongoose';
const { Schema } = mongoose;
const CheckoutSchema = new Schema({
  token: { type: String, unique: true, required: true, index: true },
  status: { type: String, enum: ['draft','processing','completed','failed'], default: 'draft' },
  customer: { type: Schema.Types.Mixed, required: true },
  items: { type: [Schema.Types.Mixed], required: true },
  orderMongoId: { type: Schema.Types.ObjectId, default: null },
  orderId: { type: String, default: '' },
  notification: { status: { type: String, enum: ['pending','sent','disabled','failed'], default: 'pending' }, attempts: { type: Number, default: 0 }, lastError: { type: String, default: '' }, nextAttemptAt: { type: Date, default: Date.now } },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
CheckoutSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('AiCheckout', CheckoutSchema);
