
// Automatic AI marketing email for new products and updated promotions.
// Requires a configured, authorized email recipient and a working FastAPI AI route.
import mongoose from "mongoose";
import nodemailer from "nodemailer";

const campaignSchema = new mongoose.Schema({
  campaignKey: { type: String, required: true, unique: true },
  productId: String,
  campaignType: String,
  recipient: String,
  status: { type: String, enum: ["processing", "sent", "failed"], default: "processing" },
  error: String,
  sentAt: Date,
  attemptCount: { type: Number, default: 0 },
}, { timestamps: true });

const CampaignLog = mongoose.models.WZMarketingCampaignLog ||
  mongoose.model("WZMarketingCampaignLog", campaignSchema);

const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const baseUrl = () => String(
  process.env.AM_HSSIN_API_URL || process.env.AI_SERVICE_URL || "http://127.0.0.1:8000"
).trim().replace(/\/+$/, "");

const safeReason = (error) => String(error?.message || error || "Unknown error").slice(0, 300);

// All AI-generated text is escaped before being inserted into HTML.
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));

const trustedImage = (value) => {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase();
    if (host === "res.cloudinary.com" || host === "wahretzmen.com" || host === "www.wahretzmen.com") {
      return url.href;
    }
  } catch { /* no image */ }
  return "";
};

// Resolve images from the current product and color image schemas.
const imageUrlFrom = (value, depth = 0) => {
  if (depth > 3 || !value) return "";
  if (typeof value === "string") return trustedImage(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = imageUrlFrom(item, depth + 1);
      if (url) return url;
    }
    return "";
  }
  if (typeof value === "object") {
    for (const key of ["secure_url", "url", "src", "image", "coverImage", "images"]) {
      const url = imageUrlFrom(value[key], depth + 1);
      if (url) return url;
    }
  }
  return "";
};

const productImageUrl = (p) => {
  for (const candidate of [p.coverImage, p.mainImage, p.image, p.images, p.colors]) {
    const url = imageUrlFrom(candidate);
    if (url) return url;
  }
  return "";
};

const marketingHtml = ({ subject, body, campaignType, promotionRate, productUrl, productImage }) => {
  const lines = String(body).split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 14);
  const paragraphs = lines.map((line) => `<p style="margin:0 0 15px;line-height:1.8;color:#364152;font-size:15px;">${escapeHtml(line)}</p>`).join("");
  const badge = campaignType === "promotion" ? `PROMOTION −${promotionRate}%` : "NOUVEAUTÉ";
  const preheader = campaignType === "promotion"
    ? `Découvrez la promotion de ${promotionRate}% sur une création Wahret Zmen.`
    : "Découvrez une nouvelle création de Wahret Zmen By Sabri.";

  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f1ee;font-family:Arial,Helvetica,sans-serif;color:#1d1d1d;">
<div style="display:none;font-size:1px;color:#f3f1ee;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f1ee;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;background:#fff;border:1px solid #e8e1d7;">
<tr><td align="center" style="background:#211b17;padding:28px 24px;"><div style="color:#e6c69b;font-size:12px;letter-spacing:3px;font-weight:bold;">WAHRET ZMEN</div><div style="color:#fff;font-size:23px;font-family:Georgia,serif;margin-top:8px;">By Sabri · Tunis</div><div style="color:#d5c4b1;font-size:12px;margin-top:9px;">L'élégance de nos traditions</div></td></tr>
<tr><td align="center" style="padding:30px 28px 12px;"><span style="display:inline-block;background:#8d5b38;color:#fff;font-size:12px;letter-spacing:1px;font-weight:bold;padding:10px 17px;">${escapeHtml(badge)}</span><h1 style="font-size:27px;line-height:1.3;font-family:Georgia,serif;font-weight:normal;margin:20px 0 8px;color:#29221d;">${escapeHtml(subject)}</h1></td></tr>

<tr><td style="padding:12px 36px 18px;">${paragraphs}</td></tr>
<tr><td align="center" style="padding:4px 24px 38px;"><a href="${escapeHtml(productUrl)}" style="display:inline-block;background:#7a4b2b;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:16px 26px;">DÉCOUVRIR LE PRODUIT</a></td></tr>
${productImage ? `<tr><td align="center" style="padding:0 24px 28px;"><img src="${escapeHtml(productImage)}" alt="Image du produit Wahret Zmen" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:0;outline:none;text-decoration:none;" /></td></tr>` : ""}
<tr><td align="center" style="background:#f8f5f0;padding:22px 24px;border-top:1px solid #e8e1d7;color:#756b60;font-size:12px;line-height:1.7;">Wahret Zmen By Sabri · Tunis<br><a href="https://www.wahretzmen.com" style="color:#7a4b2b;">www.wahretzmen.com</a><br>Message de test adressé à la boîte professionnelle configurée.</td></tr>
</table></td></tr></table></body></html>`;
};

export async function sendProductMarketingNotification(product, campaignType) {
  const recipient = String(process.env.TELECOM_NOTIFICATION_EMAIL || "").trim();

  if (!validEmail(recipient)) {
    return { status: "skipped", reason: "TELECOM_NOTIFICATION_EMAIL must be a valid email address" };
  }
  if (process.env.MARKETING_AUTO_SEND !== "true") {
    return { status: "skipped", reason: "MARKETING_AUTO_SEND is not enabled" };
  }
  if (!process.env.INTERNAL_AI_KEY || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return { status: "skipped", reason: "Missing INTERNAL_AI_KEY or SMTP credentials" };
  }
  if (!product || !["promotion", "new_product"].includes(campaignType)) {
    return { status: "skipped", reason: "Missing product or unsupported campaign type" };
  }

  const p = typeof product.toObject === "function" ? product.toObject() : product;
  const promotionRate = Number(p.promotionRate) || 0;

  if (campaignType === "promotion" && !(promotionRate > 0 && promotionRate <= 100)) {
    return { status: "skipped", reason: "No valid active promotion" };
  }

  const productId = String(p.productId || p._id || "").trim();
  if (!productId) return { status: "skipped", reason: "Missing product identifier" };

  const revision = campaignType === "promotion"
    ? `${promotionRate}:${new Date(p.updatedAt || Date.now()).getTime()}`
    : "created";

  const campaignKey = `${productId}:${campaignType}:${revision}:${recipient.toLowerCase()}`;

  // Atomic claim: never send twice for a successfully delivered campaign.
  // A failed campaign can be retried on a subsequent request.
  try {
    await CampaignLog.create({
      campaignKey,
      productId,
      campaignType,
      recipient,
      status: "processing",
      attemptCount: 1,
    });
  } catch (error) {
    if (error?.code !== 11000) {
      console.error("[Marketing campaign log]", error);
      return { status: "failed", stage: "campaign_log", reason: safeReason(error) };
    }

    const retry = await CampaignLog.findOneAndUpdate(
      { campaignKey, status: "failed" },
      { $set: { status: "processing", error: "" }, $inc: { attemptCount: 1 } },
      { new: true }
    );

    if (!retry) {
      return { status: "skipped", reason: "Campaign already sent or processing" };
    }
  }

  let stage = "ai_generation";

  try {
    const productUrl = `https://www.wahretzmen.com/products/${encodeURIComponent(productId)}`;

    const aiResponse = await fetch(`${baseUrl()}/internal/marketing-copy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-AI-Key": process.env.INTERNAL_AI_KEY,
      },
      body: JSON.stringify({
        campaign_type: campaignType,
        language: "fr",
        product: {
          productId,
          title: p.title || p.translations?.fr?.title || productId,
          description: p.description || "",
          category: p.category || "",
          subCategory: p.subCategory || "",
          promotionRate,
          productUrl,
          coverImage: productImageUrl(p),
        },
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!aiResponse.ok) {
      const details = (await aiResponse.text().catch(() => "")).slice(0, 150);
      throw new Error(`AI HTTP ${aiResponse.status}${details ? `: ${details}` : ""}`);
    }

    const draft = await aiResponse.json();

    if (
      draft.source !== "ai" ||
      typeof draft.subject !== "string" ||
      typeof draft.body !== "string" ||
      !draft.subject.trim() ||
      !draft.body.trim()
    ) {
      throw new Error("AI response missing source=ai, subject, or body");
    }

    stage = "smtp_delivery";

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "ssl0.ovh.net",
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
    });

    const receipt = await transporter.sendMail({
      from: {
        name: process.env.MAIL_FROM_NAME || "Wahret Zmen By Sabri",
        address: process.env.MAIL_FROM || process.env.SMTP_USER,
      },
      to: recipient,
      replyTo: process.env.MAIL_REPLY_TO || process.env.SMTP_USER,
      subject: draft.subject.trim().slice(0, 180),
      text: `${draft.body.trim().slice(0, 5000)}\n\nDécouvrir le produit : ${productUrl}\nWahret Zmen : https://www.wahretzmen.com`,
      html: marketingHtml({
        subject: draft.subject.trim(),
        body: draft.body.trim(),
        campaignType,
        promotionRate,
        productUrl,
        productImage: productImageUrl(p),
      }),
    });

    // Do not mark as sent unless the recipient was accepted by SMTP.
    if (!receipt.accepted?.some((email) => email.toLowerCase() === recipient.toLowerCase())) {
      throw new Error("SMTP did not accept the configured recipient");
    }

    await CampaignLog.updateOne(
      { campaignKey },
      { $set: { status: "sent", sentAt: new Date(), error: "" } }
    );

    console.info("[Automatic marketing] SMTP accepted", {
      productId,
      campaignType,
      recipient,
      messageId: receipt.messageId,
    });

    return {
      status: "sent",
      recipient,
      campaignType,
      messageId: receipt.messageId,
      accepted: receipt.accepted,
    };
  } catch (error) {
    const reason = safeReason(error);

    await CampaignLog.updateOne(
      { campaignKey },
      { $set: { status: "failed", error: reason } }
    ).catch(() => {});

    console.error(`[Automatic marketing] ${stage}: ${reason}`);

    return { status: "failed", stage, reason };
  }
}
