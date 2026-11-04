import { Router } from "express";
import Product from "../products/product.model.js";
import { sendProductMarketingNotification } from "./automaticMarketing.service.js";

// SECURITY: Mount this router ONLY behind your existing admin JWT middleware.
// A regular website visitor must never be able to trigger bulk emails.
const router = Router();

router.post("/send", async (req, res) => {
  try {
    const productId = String(req.body?.productId || "").trim();
    const campaignType = req.body?.campaignType;
    if (!/^[\w-]{1,100}$/.test(productId) || !["new_product", "promotion"].includes(campaignType)) {
      return res.status(400).json({ message: "Invalid product or campaign" });
    }
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (campaignType === "promotion" && !(Number(product.promotionRate) > 0)) {
      return res.status(422).json({ message: "This product has no active promotion" });
    }
    // Existing CampaignLog deduplication prevents repeated sends for the same revision.
    const result = await sendProductMarketingNotification(product, campaignType, { manual: true });
    const summary = result?.emailSummary || {};
    const status = result?.status === "failed" ? 502 : 200;
    return res.status(status).json({
      message: summary.accepted > 0 ? "SMTP accepted the emails" : "No new emails accepted; inspect summary",
      campaignType, productId, ...result,
    });
  } catch (error) {
    console.error("[Admin marketing email]", error);
    return res.status(500).json({ message: "Email campaign failed. Check server logs." });
  }
});

export default router;
