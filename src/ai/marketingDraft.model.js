import mongoose from "mongoose";

const marketingDraftSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, trim: true, index: true },
    campaignType: { type: String, required: true, enum: ["new_product", "promotion"], index: true },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    productUrl: { type: String, required: true, trim: true },
    promotionRate: { type: Number, default: 0, min: 0, max: 100 },
    source: { type: String, default: "ai", enum: ["ai", "manual", "template"] },
  },
  { timestamps: true }
);

marketingDraftSchema.index({ productId: 1, campaignType: 1, createdAt: -1 });

export default mongoose.models.WZMarketingDraft ||
  mongoose.model("WZMarketingDraft", marketingDraftSchema);
