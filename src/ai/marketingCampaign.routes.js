// Mount behind verifyAdminToken: /api/admin/marketing
import { Router } from "express";
import Product from "../products/product.model.js";
const router = Router();
const aiBase = () => String(process.env.AM_HSSIN_API_URL || process.env.AI_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
router.post("/draft", async (req, res) => {
  try {
    const { productId, campaignType = "new_product", language = "fr" } = req.body || {};
    if (!/^(new_product|promotion)$/.test(campaignType) || !/^(fr|ar|en)$/.test(language))
      return res.status(400).json({ message: "Invalid campaign type or language" });
    const product = await Product.findOne({ productId: String(productId || "") }).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (campaignType === "promotion" && !(Number(product.promotionRate) > 0))
      return res.status(422).json({ message: "Set a promotion percentage first" });
    const productUrl = product.seo?.canonicalUrl || "https://www.wahretzmen.com";
    const response = await fetch(`${aiBase()}/internal/marketing-copy`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Internal-AI-Key": process.env.INTERNAL_AI_KEY || "" },
      body: JSON.stringify({ campaign_type: campaignType, language, product: {
        productId: product.productId, title: product.title || product.translations?.fr?.title || product.productId,
        description: product.description, category: product.category, subCategory: product.subCategory,
        promotionRate: product.promotionRate || 0, productUrl
      }}), signal: AbortSignal.timeout(22000),
    });
    if (!response.ok) return res.status(502).json({ message: `AI service error (${response.status})` });
    const draft = await response.json();
    if (!draft.subject || !draft.body || draft.source !== "ai") throw new Error("Incomplete AI response");
    return res.json({ ...draft, productId: product.productId, campaignType, reviewRequired: true });
  } catch (err) {
    console.error("[Marketing AI]", err);
    return res.status(503).json({ message: "AI draft unavailable; check FastAPI and credentials" });
  }
});
export default router;
