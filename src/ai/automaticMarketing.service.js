
"use strict";

const MarketingDraftModule = require("./marketingDraft.model.js");
const MarketingDraft =
  MarketingDraftModule.default || MarketingDraftModule;

const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const {
  getNotificationEmails,
  getNotificationPhones,
} = require("../settings/communicationSettings.service.js");

// ============================================================
// CAMPAIGN LOG MODEL
// ============================================================

const campaignSchema = new mongoose.Schema(
  {
    campaignKey: {
      type: String,
      required: true,
      unique: true,
    },
    productId: String,
    campaignType: String,
    recipient: String,
    channel: {
      type: String,
      enum: ["email", "whatsapp"],
    },
    status: {
      type: String,
      enum: ["processing", "sent", "failed"],
      default: "processing",
    },
    error: String,
    sentAt: Date,
    attemptCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const CampaignLog =
  mongoose.models.WZMarketingCampaignLog ||
  mongoose.model("WZMarketingCampaignLog", campaignSchema);

// ============================================================
// HELPERS
// ============================================================

const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim()
  );

const baseUrl = () =>
  String(
    process.env.AM_HSSIN_API_URL ||
      process.env.AI_SERVICE_URL ||
      "http://127.0.0.1:8000"
  )
    .trim()
    .replace(/\/+$/, "");

const safeReason = (error) =>
  String(error?.message || error || "Unknown error").slice(
    0,
    300
  );

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  return digits.length >= 8 && digits.length <= 15
    ? digits
    : "";
};

const isEnabled = (key) =>
  String(process.env[key] || "").toLowerCase() === "true";

// ============================================================
// PRODUCT IMAGES
// ============================================================

const trustedImage = (value) => {
  try {
    const url = new URL(String(value || ""));

    if (url.protocol !== "https:") return "";

    const host = url.hostname.toLowerCase();

    if (
      host === "res.cloudinary.com" ||
      host === "wahretzmen.com" ||
      host === "www.wahretzmen.com"
    ) {
      return url.href;
    }
  } catch {
    // Invalid image URL
  }

  return "";
};

const imageUrlFrom = (value, depth = 0) => {
  if (depth > 4 || !value) return "";

  if (typeof value === "string") {
    return trustedImage(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = imageUrlFrom(item, depth + 1);
      if (url) return url;
    }
    return "";
  }

  if (typeof value === "object") {
    for (const key of [
      "secure_url",
      "url",
      "src",
      "image",
      "coverImage",
      "images",
    ]) {
      const url = imageUrlFrom(value[key], depth + 1);
      if (url) return url;
    }
  }

  return "";
};

const productImageUrl = (product) => {
  for (const candidate of [
    product.coverImage,
    product.mainImage,
    product.image,
    product.images,
    product.colors,
  ]) {
    const url = imageUrlFrom(candidate);
    if (url) return url;
  }

  return "";
};

const emailImageUrl = (url) => {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== "res.cloudinary.com") {
      return url;
    }

    if (!parsed.pathname.includes("/image/upload/")) {
      return url;
    }

    parsed.pathname = parsed.pathname.replace(
      "/image/upload/",
      "/image/upload/f_jpg,q_auto/"
    );

    return parsed.toString();
  } catch {
    return url;
  }
};

async function inlineProductImage(url) {
  if (!url) return null;

  const candidates = [
    ...new Set([emailImageUrl(url), url]),
  ];

  let lastError;

  for (const downloadUrl of candidates) {
    try {
      const response = await fetch(downloadUrl, {
        headers: {
          Accept: "image/jpeg,image/png,image/gif,image/*;q=0.8",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(
          `Product image HTTP ${response.status}`
        );
      }

      const declared = Number(
        response.headers.get("content-length") || 0
      );

      if (declared > 4 * 1024 * 1024) {
        throw new Error("Product image exceeds 4 MB");
      }

      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error(
          "Product image response has no body"
        );
      }

      const chunks = [];
      let total = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          total += value.byteLength;

          if (total > 4 * 1024 * 1024) {
            throw new Error(
              "Product image exceeds 4 MB"
            );
          }

          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }

      const content = Buffer.concat(chunks);

      if (!content.length) {
        throw new Error(
          "Downloaded product image is empty"
        );
      }

      const jpg =
        content.length >= 3 &&
        content[0] === 0xff &&
        content[1] === 0xd8 &&
        content[2] === 0xff;

      const png =
        content.length >= 8 &&
        content
          .subarray(0, 8)
          .equals(
            Buffer.from([
              137, 80, 78, 71, 13, 10, 26, 10,
            ])
          );

      const gif =
        content
          .subarray(0, 6)
          .toString("ascii")
          .startsWith("GIF8");

      if (!jpg && !png && !gif) {
        throw new Error(
          "Image is not JPEG, PNG or GIF"
        );
      }

      const type = jpg
        ? "image/jpeg"
        : png
          ? "image/png"
          : "image/gif";

      const extension = jpg
        ? "jpg"
        : png
          ? "png"
          : "gif";

      return {
        filename: `wahretzmen-product.${extension}`,
        content,
        contentType: type,
        cid: "wahretzmen-product-image@wahretzmen.com",
        contentDisposition: "inline",
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error("Unable to download product image")
  );
}

// ============================================================
// EMAIL HTML TEMPLATE
// ============================================================

const marketingHtml = ({
  subject,
  body,
  campaignType,
  promotionRate,
  productUrl,
  imageSrc,
}) => {
  const lines = String(body || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 14);

  const paragraphs = lines
    .map(
      (line) => `
        <p style="
          margin:0 0 15px;
          line-height:1.8;
          color:#364152;
          font-size:15px;
        ">
          ${escapeHtml(line)}
        </p>
      `
    )
    .join("");

  const badge =
    campaignType === "promotion"
      ? `PROMOTION −${promotionRate}%`
      : "NOUVEAUTÉ";

  const preheader =
    campaignType === "promotion"
      ? `Découvrez la promotion de ${promotionRate}% sur une création Wahret Zmen.`
      : "Découvrez une nouvelle création de Wahret Zmen By Sabri.";

  const image = imageSrc
    ? `
      <tr>
        <td align="center" style="padding:18px 24px;">
          <img
            src="${escapeHtml(imageSrc)}"
            alt="Produit Wahret Zmen"
            width="420"
            style="
              display:block;
              max-width:100%;
              height:auto;
              border:0;
            "
          />
        </td>
      </tr>
    `
    : "";

  return `
<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="
  margin:0;
  padding:0;
  background:#f3f1ee;
  font-family:Arial,Helvetica,sans-serif;
  color:#1d1d1d;
">
  <div style="
    display:none;
    font-size:1px;
    color:#f3f1ee;
    line-height:1px;
    max-height:0;
    max-width:0;
    opacity:0;
    overflow:hidden;
  ">
    ${escapeHtml(preheader)}
  </div>
  <table
    role="presentation"
    cellpadding="0"
    cellspacing="0"
    border="0"
    width="100%"
    style="background:#f3f1ee;"
  >
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          width="100%"
          style="
            max-width:620px;
            background:#ffffff;
            border:1px solid #e8e1d7;
          "
        >
          <tr>
            <td
              align="center"
              style="
                background:#211b17;
                padding:28px 24px;
              "
            >
              <div style="
                color:#e6c69b;
                font-size:12px;
                letter-spacing:3px;
                font-weight:bold;
              ">
                WAHRET ZMEN
              </div>
              <div style="
                color:#ffffff;
                font-size:23px;
                font-family:Georgia,serif;
                margin-top:8px;
              ">
                By Sabri · Tunis
              </div>
              <div style="
                color:#d5c4b1;
                font-size:12px;
                margin-top:9px;
              ">
                L'élégance de nos traditions
              </div>
            </td>
          </tr>
          <tr>
            <td
              align="center"
              style="padding:30px 28px 12px;"
            >
              <span style="
                display:inline-block;
                background:#8d5b38;
                color:#ffffff;
                font-size:12px;
                letter-spacing:1px;
                font-weight:bold;
                padding:10px 17px;
              ">
                ${escapeHtml(badge)}
              </span>
              <h1 style="
                font-size:27px;
                line-height:1.3;
                font-family:Georgia,serif;
                font-weight:normal;
                margin:20px 0 8px;
                color:#29221d;
              ">
                ${escapeHtml(subject)}
              </h1>
            </td>
          </tr>
          ${image}
          <tr>
            <td style="padding:12px 36px 18px;">
              ${paragraphs}
            </td>
          </tr>
          <tr>
            <td
              align="center"
              style="padding:4px 24px 38px;"
            >
              <a
                href="${escapeHtml(productUrl)}"
                style="
                  display:inline-block;
                  background:#7a4b2b;
                  color:#ffffff;
                  text-decoration:none;
                  font-size:14px;
                  font-weight:bold;
                  padding:16px 26px;
                "
              >
                DÉCOUVRIR LE PRODUIT
              </a>
            </td>
          </tr>
          <tr>
            <td
              align="center"
              style="
                background:#f8f5f0;
                padding:22px 24px;
                border-top:1px solid #e8e1d7;
                color:#756b60;
                font-size:12px;
                line-height:1.7;
              "
            >
              Wahret Zmen By Sabri · Tunis
              <br />
              <a
                href="https://www.wahretzmen.com"
                style="color:#7a4b2b;"
              >
                www.wahretzmen.com
              </a>
              <br />
              Notification destinée aux contacts
              configurés par l'administration.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

// ============================================================
// MONGODB CAMPAIGN LOGGING
// ============================================================

const claim = async ({
  campaignKey,
  productId,
  campaignType,
  recipient,
  channel,
}) => {
  try {
    await CampaignLog.create({
      campaignKey,
      productId,
      campaignType,
      recipient,
      channel,
      status: "processing",
      attemptCount: 1,
    });

    return true;
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    const retried =
      await CampaignLog.findOneAndUpdate(
        {
          campaignKey,
          status: "failed",
        },
        {
          $set: {
            status: "processing",
            error: "",
          },
          $inc: {
            attemptCount: 1,
          },
        },
        { new: true }
      );

    return Boolean(retried);
  }
};

const updateLog = (
  campaignKey,
  status,
  error = ""
) =>
  CampaignLog.updateOne(
    { campaignKey },
    {
      $set: {
        status,
        error,
        ...(status === "sent"
          ? { sentAt: new Date() }
          : {}),
      },
    }
  );

// ============================================================
// WHATSAPP BUSINESS API — OPTIONAL
// ============================================================

async function sendWhatsAppTemplate(
  phone,
  product,
  campaignType,
  productUrl
) {
  const token = String(
    process.env.WHATSAPP_ACCESS_TOKEN || ""
  ).trim();

  const phoneNumberId = String(
    process.env.WHATSAPP_PHONE_NUMBER_ID || ""
  ).trim();

  const templateName =
    campaignType === "promotion"
      ? process.env.WHATSAPP_PROMOTION_TEMPLATE
      : process.env.WHATSAPP_NEW_PRODUCT_TEMPLATE;

  const languageCode = String(
    process.env.WHATSAPP_TEMPLATE_LANGUAGE || "fr"
  );

  if (!token || !phoneNumberId || !templateName) {
    return {
      status: "skipped",
      reason:
        "WhatsApp Business API/template not configured",
    };
  }

  const title = String(
    product.translations?.fr?.title ||
      product.title ||
      product.productId ||
      "Wahret Zmen"
  ).slice(0, 160);

  const detail =
    campaignType === "promotion"
      ? `Promotion de ${Number(product.promotionRate)}%`
      : "Nouvelle collection";

  const apiVersion = String(
    process.env.WHATSAPP_GRAPH_VERSION || "v23.0"
  );

  if (
    !/^v\d+\.\d+$/.test(apiVersion) ||
    !/^\d+$/.test(phoneNumberId)
  ) {
    throw new Error(
      "Invalid WhatsApp API configuration"
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: languageCode,
          },
          components: [
            {
              type: "body",
              parameters: [
                title,
                detail,
                productUrl,
              ].map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    }
  );

  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok || !data.messages?.[0]?.id) {
    throw new Error(
      `WhatsApp API HTTP ${response.status}: ${JSON.stringify(
        data.error || {}
      ).slice(0, 180)}`
    );
  }

  return {
    status: "accepted",
    messageId: data.messages[0].id,
  };
}

// ============================================================
// PROMOTION VALIDATION
// ============================================================

/**
 * MongoDB product.promotionRate is the source of truth.
 * Never advertise an invented AI discount.
 */
function enforceProductPromotionRate(text, promotionRate) {
  const value = String(text ?? "");
  const rate = Number(promotionRate);

  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    if (/\b\d+(?:[.,]\d+)?\s*%/u.test(value)) {
      throw new Error(
        "AI invented a discount for a non-promotional product"
      );
    }

    return value;
  }

  return value.replace(
    /\b\d+(?:[.,]\d+)?\s*%/gu,
    `${rate}%`
  );
}

// ============================================================
// MAIN AUTOMATIC MARKETING FUNCTION
// ============================================================

async function sendProductMarketingNotification(
  product,
  campaignType
) {
  if (!isEnabled("MARKETING_AUTO_SEND")) {
    console.warn(
      "[Marketing] Automatic email marketing disabled. Set MARKETING_AUTO_SEND=true in the Node backend environment."
    );

    return {
      status: "skipped",
      reason: "MARKETING_AUTO_SEND disabled",
    };
  }

  if (
    !product ||
    !["new_product", "promotion"].includes(campaignType)
  ) {
    return {
      status: "skipped",
      reason: "Invalid campaign",
    };
  }

  const p =
    typeof product.toObject === "function"
      ? product.toObject()
      : product;

  const productId = String(
    p.productId || p._id || ""
  ).trim();

  const promotionRate =
    Number(p.promotionRate) || 0;

  if (
    !productId ||
    (campaignType === "promotion" &&
      !(promotionRate > 0 && promotionRate <= 100))
  ) {
    return {
      status: "skipped",
      reason: "Invalid product or promotion",
    };
  }

  const section =
    campaignType === "new_product"
      ? "newMessages"
      : "promotions";

  // ==========================================================
  // LOAD SAVED RECIPIENTS
  // ==========================================================

  let emails = [];
  let phones = [];

  try {
    [emails, phones] = await Promise.all([
      getNotificationEmails(section),
      getNotificationPhones(section),
    ]);
  } catch (error) {
    return {
      status: "failed",
      stage: "recipients",
      reason: safeReason(error),
    };
  }

  emails = [
    ...new Set(
      (emails || [])
        .map((value) =>
          String(value).trim().toLowerCase()
        )
        .filter(validEmail)
    ),
  ];

  phones = [
    ...new Set(
      (phones || [])
        .map(normalizePhone)
        .filter(Boolean)
    ),
  ];

  console.info("[Marketing recipients]", {
    productId,
    campaignType,
    section,
    emailCount: emails.length,
    whatsappCount: phones.length,
  });

  if (!emails.length) {
    console.warn(
      "[Marketing Email] No recipients in the selected list",
      {
        campaignType,
        section,
        productId,
        action:
          "Add consenting customer emails to this section in Admin Communication Settings",
      }
    );
  }

  const internalKey = String(
    process.env.INTERNAL_AI_KEY || ""
  ).trim();

  if (!internalKey && campaignType === "promotion") {
    return {
      status: "failed",
      stage: "ai_configuration",
      campaignType,
      section,
      reason: "INTERNAL_AI_KEY missing",
      emailSummary: {
        configured: emails.length,
        accepted: 0,
        failed: 0,
        skipped: emails.length,
        smtpError: null,
      },
    };
  }

  if (!internalKey) {
    console.warn(
      "[Marketing NEWS] AI key missing; using safe news fallback after AI stage"
    );
  }

  const revision =
    campaignType === "new_product"
      ? "created"
      : `${promotionRate}:${new Date(
          p.updatedAt || Date.now()
        ).getTime()}`;

  const productUrl =
    `https://www.wahretzmen.com/` +
    encodeURIComponent(productId);

  // ==========================================================
  // GENERATE ONE AI MESSAGE
  // ==========================================================

  let draft;

  try {
    if (!internalKey) {
      throw new Error("INTERNAL_AI_KEY missing");
    }

    let lastAiError;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const aiResponse = await fetch(
          `${baseUrl()}/internal/marketing-copy`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Internal-AI-Key": internalKey,
            },
            body: JSON.stringify({
              campaign_type: campaignType,
              language: "fr",
              product: {
                productId,
                title:
                  p.translations?.fr?.title ||
                  p.title ||
                  productId,
                description:
                  p.translations?.fr?.description ||
                  p.description ||
                  "",
                category: p.category || "",
                subCategory: p.subCategory || "",
                promotionRate,
                productUrl,
                coverImage: productImageUrl(p),
              },
            }),
            signal: AbortSignal.timeout(
              Math.min(
                45000,
                Math.max(
                  10000,
                  Number(
                    process.env.MARKETING_AI_TIMEOUT_MS ||
                      25000
                  )
                )
              )
            ),
          }
        );

        if (!aiResponse.ok) {
          throw new Error(
            `AI HTTP ${aiResponse.status}`
          );
        }

        draft = await aiResponse.json();

        if (
          draft.source !== "ai" ||
          typeof draft.subject !== "string" ||
          !draft.subject.trim() ||
          typeof draft.body !== "string" ||
          !draft.body.trim()
        ) {
          throw new Error(
            "Incomplete AI marketing draft"
          );
        }

        lastAiError = null;
        break;
      } catch (error) {
        lastAiError = error;

        console.warn(
          "[Marketing AI attempt failed]",
          {
            campaignType,
            productId,
            attempt,
            reason: safeReason(error),
          }
        );

        if (attempt < 3) {
          await new Promise((resolve) =>
            setTimeout(resolve, 800 * attempt)
          );
        }
      }
    }

    if (lastAiError) {
      throw lastAiError;
    }
  } catch (error) {
    console.error(
      "[Marketing AI] Generation failed",
      {
        productId,
        campaignType,
        section,
        reason: safeReason(error),
      }
    );

    if (campaignType !== "new_product") {
      return {
        status: "failed",
        campaignType,
        section,
        stage: "ai_generation",
        reason: safeReason(error),
        emailSummary: {
          configured: emails.length,
          accepted: 0,
          failed: 0,
          skipped: emails.length,
          smtpError: null,
        },
      };
    }

    // New-product fallback only.
    const title = String(
      p.translations?.fr?.title ||
        p.title ||
        "notre nouvelle création"
    ).trim();

    const description = String(
      p.translations?.fr?.description ||
        p.description ||
        ""
    ).trim();

    draft = {
      source: "template",
      subject: `Nouveauté Wahret Zmen : ${title}`,
      body:
        `Découvrez notre nouvelle création : ${title}.` +
        (description
          ? `\n\n${description.slice(0, 700)}`
          : "") +
        `\n\nRetrouvez ce produit sur notre boutique en ligne.`,
    };

    console.warn(
      "[Marketing AI] Using explicitly labeled news-only fallback",
      {
        productId,
        campaignType,
        recipientCount: emails.length,
      }
    );
  }

  let subject;
  let body;

  try {
    subject = enforceProductPromotionRate(
      draft.subject,
      promotionRate
    )
      .trim()
      .slice(0, 180);

    body = enforceProductPromotionRate(
      draft.body,
      promotionRate
    )
      .trim()
      .slice(0, 5000);

    if (
      campaignType === "promotion" &&
      !new RegExp(
        `(?:^|\\D)${promotionRate}%`
      ).test(`${subject} ${body}`)
    ) {
      body =
        `Promotion de ${promotionRate}% sur ce produit.\n\n${body}`;
    }
  } catch (error) {
    return {
      status: "failed",
      stage: "promotion_validation",
      reason: safeReason(error),
    };
  }

  // ==========================================================
  // SAVE MARKETING DRAFT
  // ==========================================================

  let savedDraft;

  try {
    savedDraft = await MarketingDraft.create({
      productId,
      campaignType,
      subject,
      body,
      productUrl,
      promotionRate,
      source:
        draft.source === "ai"
          ? "ai"
          : "template",
    });
  } catch (error) {
    console.error(
      "[Marketing draft storage] Email delivery will continue",
      {
        productId,
        campaignType,
        reason: safeReason(error),
      }
    );

    savedDraft = null;
  }

  const results = {
    emails: [],
    whatsapp: [],
  };

  // ==========================================================
  // SMTP CONFIGURATION
  // ==========================================================

  let transporter = null;

  const smtpUser = String(
    process.env.SMTP_USER || ""
  ).trim();

  const smtpPassword = String(
    process.env.SMTP_PASSWORD || ""
  );

  const smtpHost = String(
    process.env.SMTP_HOST || "ssl0.ovh.net"
  ).trim();

  const smtpPort = Number(
    process.env.SMTP_PORT || 465
  );

  const smtpSecure =
    String(
      process.env.SMTP_SECURE ??
        (smtpPort === 465)
    ).toLowerCase() === "true";

  console.info("[Marketing SMTP config]", {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    hasUser: Boolean(smtpUser),
    hasPassword: Boolean(smtpPassword),
  });

  const coverUrl = productImageUrl(p);
  let inlineImage = null;

  if (
    emails.length &&
    smtpUser &&
    smtpPassword
  ) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
    });

    if (coverUrl) {
      try {
        inlineImage = await inlineProductImage(
          coverUrl
        );
      } catch (error) {
        console.warn(
          "[Marketing image]",
          safeReason(error)
        );
      }
    }
  }

  // ==========================================================
  // VERIFY SMTP CONNECTION
  // ==========================================================

  let smtpConnectionError = null;

  if (emails.length && transporter) {
    try {
      await transporter.verify();

      console.info(
        "[Marketing SMTP] Connection verified",
        {
          campaignType,
          emailCount: emails.length,
        }
      );
    } catch (error) {
      smtpConnectionError = safeReason(error);

      console.error(
        "[Marketing SMTP] Verification failed:",
        smtpConnectionError
      );
    }
  }

  if (emails.length && !transporter) {
    smtpConnectionError =
      "SMTP_USER or SMTP_PASSWORD missing in the running Node backend environment";

    console.error(
      "[Marketing SMTP]",
      smtpConnectionError
    );
  }

  // ==========================================================
  // SEND EMAILS
  // ==========================================================

  for (const recipient of emails) {
    const campaignKey =
      `${productId}:${campaignType}:` +
      `${revision}:email:${recipient}`;

    try {
      const claimed = await claim({
        campaignKey,
        productId,
        campaignType,
        recipient,
        channel: "email",
      });

      if (!claimed) {
        results.emails.push({
          recipient,
          status: "skipped",
          reason: "Already sent or processing",
        });

        continue;
      }

      if (smtpConnectionError) {
        throw new Error(
          `SMTP unavailable: ${smtpConnectionError}`
        );
      }

      if (!transporter) {
        throw new Error(
          "SMTP credentials missing"
        );
      }

      const receipt = await transporter.sendMail({
        from: {
          name:
            process.env.MAIL_FROM_NAME ||
            "Wahret Zmen By Sabri",
          address:
            process.env.MAIL_FROM ||
            smtpUser,
        },
        to: recipient,
        replyTo:
          process.env.MAIL_REPLY_TO ||
          smtpUser,
        subject,
        text:
          `${body}\n\n` +
          `Découvrir le produit : ${productUrl}`,
        attachments: inlineImage
          ? [inlineImage]
          : [],
        html: marketingHtml({
          subject,
          body,
          campaignType,
          promotionRate,
          productUrl,
          imageSrc: inlineImage
            ? `cid:${inlineImage.cid}`
            : coverUrl || "",
        }),
      });

      const accepted = (
        receipt.accepted || []
      ).some(
        (value) =>
          String(value).toLowerCase() ===
          recipient.toLowerCase()
      );

      if (!accepted) {
        throw new Error(
          "SMTP did not accept recipient"
        );
      }

      await updateLog(
        campaignKey,
        "sent"
      );

      results.emails.push({
        recipient,
        status: "accepted",
        messageId: receipt.messageId,
      });
    } catch (error) {
      await updateLog(
        campaignKey,
        "failed",
        safeReason(error)
      ).catch(() => {});

      results.emails.push({
        recipient,
        status: "failed",
        reason: safeReason(error),
      });

      console.error(
        "[Marketing Email]",
        recipient,
        safeReason(error)
      );
    }
  }

  // ==========================================================
  // WHATSAPP DELIVERY
  // ==========================================================

  const whatsappMode = String(
    process.env.MARKETING_WHATSAPP_MODE ||
      "manual"
  )
    .trim()
    .toLowerCase();

  if (whatsappMode === "api") {
    for (const phone of phones) {
      const campaignKey =
        `${productId}:${campaignType}:` +
        `${revision}:whatsapp:${phone}`;

      try {
        const claimed = await claim({
          campaignKey,
          productId,
          campaignType,
          recipient: phone,
          channel: "whatsapp",
        });

        if (!claimed) {
          results.whatsapp.push({
            recipient: phone,
            status: "skipped",
            reason: "Already sent or processing",
          });

          continue;
        }

        const sent = await sendWhatsAppTemplate(
          phone,
          p,
          campaignType,
          productUrl
        );

        if (sent.status === "skipped") {
          await updateLog(
            campaignKey,
            "failed",
            sent.reason
          );

          results.whatsapp.push({
            recipient: phone,
            ...sent,
          });

          continue;
        }

        await updateLog(
          campaignKey,
          "sent"
        );

        results.whatsapp.push({
          recipient: phone,
          ...sent,
        });
      } catch (error) {
        await updateLog(
          campaignKey,
          "failed",
          safeReason(error)
        ).catch(() => {});

        results.whatsapp.push({
          recipient: phone,
          status: "failed",
          reason: safeReason(error),
        });

        console.error(
          "[Marketing WhatsApp]",
          phone,
          safeReason(error)
        );
      }
    }
  } else {
    for (const phone of phones) {
      results.whatsapp.push({
        recipient: phone,
        status: "manual",
        reason:
          "Prepared for administrator confirmation in WhatsApp",
      });
    }
  }

  // ==========================================================
  // FINAL RESPONSE
  // ==========================================================

  const hasFailures = [
    ...results.emails,
    ...results.whatsapp,
  ].some(
    (item) => item.status === "failed"
  );

  const emailSummary = {
    configured: emails.length,
    accepted: results.emails.filter(
      (item) => item.status === "accepted"
    ).length,
    failed: results.emails.filter(
      (item) => item.status === "failed"
    ).length,
    skipped: results.emails.filter(
      (item) => item.status === "skipped"
    ).length,
    smtpError: smtpConnectionError,
  };

  console.info(
    "[Marketing delivery summary]",
    {
      productId,
      campaignType,
      section,
      emailSummary,
      whatsappCount: results.whatsapp.length,
    }
  );

  if (
    emailSummary.failed > 0 ||
    emailSummary.configured === 0
  ) {
    console.warn(
      "[Marketing Email] Action required",
      {
        productId,
        campaignType,
        section,
        ...emailSummary,
      }
    );
  }

  return {
    status: !emails.length
      ? "no_email_recipients"
      : hasFailures
        ? "partial_or_failed"
        : "processed",
    campaignType,
    section,
    draftStored: Boolean(savedDraft?._id),
    draftId: savedDraft?._id
      ? String(savedDraft._id)
      : null,
    emailSummary,
    copySource: draft.source,
    results,
  };
}

// ============================================================
// COMMONJS EXPORT — VERCEL COMPATIBLE
// ============================================================

module.exports = {
  sendProductMarketingNotification,
};
