// src/orders/order.controller.js

import { sendProfessionalMail } from "../services/mail.service.js";
import Order from "./order.model.js";
import Product from "../products/product.model.js";

const ORDER_STATUSES = [
  "تم تأكيد الطلب",
  "قيد التحضير",
  "خارج للتسليم",
  "تم التسليم والدفع",
];

const PROGRESS_ALLOWED = new Set([0, 20, 40, 60, 80, 100]);

const STATUS_PROGRESS = {
  "تم تأكيد الطلب": 20,
  "قيد التحضير": 40,
  "خارج للتسليم": 60,
  "تم التسليم والدفع": 100,
};

const pickString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  if (typeof value === "boolean") return String(value).trim();

  if (typeof value === "object") {
    return String(value.ar || value.fr || value.en || fallback).trim();
  }

  return fallback;
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const ensureMinQty = (value, fallback = 1) =>
  Math.max(1, Math.floor(toNum(value, fallback)));

const isValidStatus = (status) =>
  ORDER_STATUSES.includes(pickString(status));

const normalizeColorName = (colorName) =>
  pickString(colorName, "أصلي");

const normalizeImages = (images) =>
  Array.isArray(images)
    ? images.map(pickString).filter(Boolean)
    : [];

const normalizeOrderPiece = (piece = {}) => {
  const name = pickString(piece?.name);

  if (!name) return null;

  return {
    ...(piece?._id ? { _id: piece._id } : {}),
    key: pickString(piece?.key || piece?._id || name),
    name,
    price: null,
    quantity: ensureMinQty(
      piece?.quantity ?? piece?.qty ?? piece?.count,
      1
    ),
  };
};

const normalizeOrderPieces = (pieces = []) =>
  (Array.isArray(pieces) ? pieces : [])
    .map(normalizeOrderPiece)
    .filter(Boolean);

const normalizeOrderLine = (line = {}) => {
  const quantity = ensureMinQty(line?.quantity, 1);

  const unit = Number(
    toNum(
      line?.unitPrice ?? line?.price ?? line?.newPrice,
      0
    ).toFixed(2)
  );

  const images = normalizeImages(line?.color?.images);

  const image =
    pickString(line?.color?.image) ||
    images[0] ||
    pickString(line?.coverImage) ||
    "/assets/default-image.png";

  const selectedPieces = normalizeOrderPieces(
    line?.selectedPieces || line?.pieces
  );

  return {
    ...line,

    productId: pickString(
      line?.productId?.productId ||
        line?.productId ||
        line?.product?.productId ||
        line?.product?.id
    ),

    quantity,

    price: unit,
    unitPrice: unit,
    newPrice: unit,

    pieces: selectedPieces,
    selectedPieces,

    color: {
      ...(line?.color || {}),
      colorName: line?.color?.colorName ?? "أصلي",
      image,
      images: images.length
        ? [...new Set(images)]
        : [image].filter(Boolean),
    },

    size: pickString(line?.size || line?.selectedSize),

    category: pickString(line?.category),

    subCategory: pickString(line?.subCategory),

    colorKey: pickString(line?.colorKey),
  };
};

const normalizeOrderProductsArray = (lines = []) =>
  (Array.isArray(lines) ? lines : []).map(normalizeOrderLine);

const getColorNameFromProductColor = (color) => {
  if (!color) return "";

  if (typeof color.colorName === "string") {
    return color.colorName.trim();
  }

  if (typeof color.colorName === "object") {
    return pickString(color.colorName);
  }

  if (typeof color.name === "string") {
    return color.name.trim();
  }

  if (typeof color.name === "object") {
    return pickString(color.name);
  }

  return "";
};

const getColorImagesFromProductColor = (color) => {
  if (!color) return [];

  if (Array.isArray(color.images) && color.images.length) {
    return color.images.filter(Boolean);
  }

  if (color.image) {
    return [color.image].filter(Boolean);
  }

  return [];
};

const findMatchingColor = (product, rawLine) => {
  const colors = Array.isArray(product?.colors)
    ? product.colors
    : [];

  if (!colors.length) return null;

  const wantedImage = pickString(
    rawLine?.color?.image || rawLine?.image
  );

  const wantedName = normalizeColorName(
    rawLine?.color?.colorName || rawLine?.colorName
  );

  const wantedColorKey = pickString(rawLine?.colorKey);

  if (wantedImage) {
    const byImage = colors.find((color) =>
      getColorImagesFromProductColor(color).some(
        (image) => pickString(image) === wantedImage
      )
    );

    if (byImage) return byImage;
  }

  if (wantedName) {
    const byName = colors.find(
      (color) =>
        getColorNameFromProductColor(color) === wantedName
    );

    if (byName) return byName;
  }

  if (wantedColorKey) {
    const byKey = colors.find((color) => {
      const images = getColorImagesFromProductColor(color);
      const firstImage = images[0] || "";
      const colorName = getColorNameFromProductColor(color);

      const imageKey = firstImage ? `img:${firstImage}` : "";

      const nameKey = colorName
        ? `name:${JSON.stringify({
            ar: colorName,
            fr: colorName,
            en: colorName,
          })}`
        : "";

      return (
        wantedColorKey === imageKey ||
        wantedColorKey === nameKey
      );
    });

    if (byKey) return byKey;
  }

  return null;
};

const resolveMatchingColorOrFallback = (product, rawLine) => {
  const exact = findMatchingColor(product, rawLine);

  if (exact) return exact;

  const colors = Array.isArray(product?.colors)
    ? product.colors
    : [];

  if (colors.length === 1) return colors[0];

  return null;
};

const recalcProductStockQuantity = (productDoc) => {
  const colors = Array.isArray(productDoc?.colors)
    ? productDoc.colors
    : [];

  if (colors.length) {
    productDoc.stockQuantity = colors.reduce(
      (sum, color) =>
        sum + Math.max(0, toNum(color?.stock, 0)),
      0
    );
  } else {
    productDoc.stockQuantity = Math.max(
      0,
      toNum(productDoc?.stockQuantity, 0)
    );
  }
};

const computeTotalsFromLines = (
  lines = [],
  shippingFallback = 0
) => {
  const normalized = normalizeOrderProductsArray(lines);

  const subtotal = normalized.reduce((sum, line) => {
    return (
      sum +
      toNum(
        line?.price ?? line?.unitPrice ?? line?.newPrice,
        0
      ) *
        ensureMinQty(line?.quantity, 1)
    );
  }, 0);

  const shipping = Math.max(
    0,
    toNum(shippingFallback, 0)
  );

  const total = subtotal + shipping;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
};

const normalizeOrderBeforeSend = async (orderDoc) => {
  if (!orderDoc) return orderDoc;

  const status = pickString(orderDoc.status);

  if (!isValidStatus(status)) {
    orderDoc.status = "تم تأكيد الطلب";
  }

  const safeProducts = normalizeOrderProductsArray(
    orderDoc.products || []
  );

  orderDoc.products = safeProducts;

  const totals = computeTotalsFromLines(
    safeProducts,
    toNum(
      orderDoc?.totals?.shipping,
      toNum(orderDoc.shipping, 0)
    )
  );

  orderDoc.totals = totals;
  orderDoc.subtotal = totals.subtotal;
  orderDoc.shipping = totals.shipping;
  orderDoc.totalPrice = totals.total;
  orderDoc.total = totals.total;

  await orderDoc.save().catch(() => {});

  return orderDoc;
};

const hydrateOrderProducts = async (orderDoc) => {
  if (!orderDoc) return orderDoc;

  const baseOrder =
    typeof orderDoc.toObject === "function"
      ? orderDoc.toObject()
      : { ...orderDoc };

  const lines = normalizeOrderProductsArray(
    baseOrder.products || []
  );

  if (!lines.length) {
    return {
      ...baseOrder,
      products: [],
    };
  }

  const productIds = [
    ...new Set(
      lines
        .map((line) => pickString(line?.productId))
        .filter(Boolean)
    ),
  ];

  const products = productIds.length
    ? await Product.find({
        productId: {
          $in: productIds,
        },
      })
        .select(
          "productId title translations embroideryCategory category subCategory colors coverImage newPrice stockQuantity pieces"
        )
        .lean()
    : [];

  const productMap = new Map(
    products.map((product) => [
      pickString(product.productId),
      product,
    ])
  );

  const enrichedLines = lines.map((line) => {
    const product = productMap.get(
      pickString(line.productId)
    );

    const selectedPieces = normalizeOrderPieces(
      line?.selectedPieces || line?.pieces
    );

    return {
      ...normalizeOrderLine(line),

      productData: product || null,

      category: pickString(
        line?.category || product?.category
      ),

      subCategory: pickString(
        line?.subCategory || product?.subCategory
      ),

      embroideryCategory:
        line?.embroideryCategory ||
        product?.embroideryCategory ||
        "",

      pieces: selectedPieces,
      selectedPieces,
    };
  });

  const totals = computeTotalsFromLines(
    enrichedLines,
    toNum(
      baseOrder?.totals?.shipping,
      toNum(baseOrder?.shipping, 0)
    )
  );

  return {
    ...baseOrder,

    products: enrichedLines,

    totals,

    subtotal: totals.subtotal,
    shipping: totals.shipping,
    totalPrice: totals.total,
    total: totals.total,
  };
};

const mergeProductProgressIntoOrder = (
  orderDoc,
  patchMap
) => {
  if (
    !orderDoc ||
    !patchMap ||
    typeof patchMap !== "object"
  ) {
    return;
  }

  if (!orderDoc.productProgress) {
    orderDoc.productProgress = new Map();
  }

  for (const [key, value] of Object.entries(patchMap || {})) {
    const cleanKey = pickString(key);
    const progress = toNum(value, NaN);

    if (!cleanKey) continue;
    if (!Number.isFinite(progress)) continue;
    if (!PROGRESS_ALLOWED.has(progress)) continue;

    orderDoc.productProgress.set(cleanKey, progress);
  }
};

const syncExistingProductProgressFromStatus = (
  orderDoc,
  status
) => {
  const progress = STATUS_PROGRESS[pickString(status)];

  if (
    !orderDoc ||
    !PROGRESS_ALLOWED.has(progress)
  ) {
    return;
  }

  const current =
    orderDoc.productProgress instanceof Map
      ? Object.fromEntries(
          orderDoc.productProgress.entries()
        )
      : orderDoc.productProgress &&
        typeof orderDoc.productProgress === "object"
      ? { ...orderDoc.productProgress }
      : {};

  const keys = Object.keys(current);

  if (!keys.length) {
    for (const line of orderDoc.products || []) {
      const pid = pickString(line?.productId);

      if (pid) {
        current[pid] = progress;
      }
    }
  } else {
    for (const key of keys) {
      current[key] = progress;
    }
  }

  orderDoc.productProgress = current;
  orderDoc.markModified?.("productProgress");
};

const aggregateReservations = (reservations = []) => {
  const bucket = new Map();

  for (const reservation of reservations) {
    const key = `${pickString(
      reservation.productId
    )}::${pickString(reservation.colorId)}`;

    const previous = bucket.get(key);

    if (previous) {
      previous.quantity += ensureMinQty(
        reservation.quantity,
        1
      );
    } else {
      bucket.set(key, {
        productId: pickString(reservation.productId),
        colorId: pickString(reservation.colorId),
        quantity: ensureMinQty(
          reservation.quantity,
          1
        ),
      });
    }
  }

  return Array.from(bucket.values());
};

const rollbackStockAdjustments = async (applied = []) => {
  for (const adjustment of applied) {
    try {
      const product = await Product.findOne({
        productId: adjustment.productId,
      });

      if (!product) continue;

      const quantity = ensureMinQty(
        adjustment.quantity,
        1
      );

      const colors = Array.isArray(product.colors)
        ? product.colors
        : [];

      if (adjustment.colorId) {
        const color = colors.find(
          (item) =>
            String(item?._id || "") ===
            String(adjustment.colorId)
        );

        if (color) {
          color.stock = Math.max(
            0,
            toNum(color.stock, 0) + quantity
          );
        } else {
          product.stockQuantity = Math.max(
            0,
            toNum(product.stockQuantity, 0) + quantity
          );
        }
      } else {
        product.stockQuantity = Math.max(
          0,
          toNum(product.stockQuantity, 0) + quantity
        );
      }

      recalcProductStockQuantity(product);

      await product.save();
    } catch (error) {
      console.error(
        "rollbackStockAdjustments error:",
        error
      );
    }
  }
};

const createOrder = async (req, res) => {
  const appliedAdjustments = [];

  try {
    const body = req.body || {};

    const name = pickString(body.name);
    const email = pickString(body.email).toLowerCase();
    const phone = pickString(body.phone);

    const addressObj = {
      street: pickString(
        body.address?.street || body.street
      ),

      city: pickString(
        body.address?.city || body.city
      ),

      state: pickString(
        body.address?.state || body.state
      ),

      country: pickString(
        body.address?.country ||
          body.country ||
          "Tunisia"
      ),

      zipcode: pickString(
        body.address?.zipcode ||
          body.zipcode ||
          body.postal ||
          body.postalCode
      ),
    };

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message:
          "يرجى إدخال الاسم والبريد والهاتف.",
      });
    }

    if (
      !addressObj.street ||
      !addressObj.city ||
      !addressObj.state ||
      !addressObj.country ||
      !addressObj.zipcode
    ) {
      return res.status(400).json({
        success: false,
        message: "العنوان غير مكتمل.",
      });
    }

    const products = Array.isArray(body.products)
      ? body.products
      : [];

    if (!products.length) {
      return res.status(400).json({
        success: false,
        message: "لا توجد منتجات في الطلب.",
      });
    }

    const normalizedLines = [];
    const reservations = [];

    for (const raw of products) {
      const productId = pickString(
        raw?.productId?.productId ||
          raw?.productId ||
          raw?.product?.productId ||
          raw?.product?.id
      );

      const quantity = ensureMinQty(
        raw?.quantity,
        1
      );

      if (!productId) {
        return res.status(400).json({
          success: false,
          message: "معرّف المنتج غير صالح.",
        });
      }

      const product = await Product.findOne({
        productId,
      }).select(
        "productId title translations newPrice coverImage colors embroideryCategory category subCategory stockQuantity pieces"
      );

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `المنتج غير موجود: ${productId}`,
        });
      }

      const selectedPieces = normalizeOrderPieces(
        raw?.selectedPieces || raw?.pieces
      );

      const productPieces = normalizeOrderPieces(
        product?.pieces
      );

      if (
        productPieces.length > 0 &&
        selectedPieces.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: `يجب اختيار قطعة واحدة على الأقل من المنتج ${productId}.`,
        });
      }

      const matchedColor =
        resolveMatchingColorOrFallback(
          product,
          raw
        );

      const colorName = normalizeColorName(
        matchedColor?.colorName ||
          raw?.color?.colorName ||
          raw?.colorName
      );

      const pickedImages = matchedColor
        ? getColorImagesFromProductColor(
            matchedColor
          )
        : normalizeImages(
            raw?.color?.images || raw?.images
          );

      const mainImage =
        pickString(
          raw?.color?.image ||
            raw?.image
        ) ||
        pickedImages[0] ||
        pickString(product.coverImage) ||
        "/assets/default-image.png";

      const availableStock = matchedColor
        ? Math.max(
            0,
            toNum(matchedColor?.stock, 0)
          )
        : Math.max(
            0,
            toNum(product?.stockQuantity, 0)
          );

      if (quantity > availableStock) {
        return res.status(400).json({
          success: false,
          message: `الكمية المطلوبة غير متوفرة للمنتج ${productId}. المتوفر حاليًا: ${availableStock}`,
        });
      }

      const unitPrice = Number(
        toNum(product.newPrice, 0).toFixed(2)
      );

      normalizedLines.push(
        normalizeOrderLine({
          productId,
          quantity,

          price: unitPrice,
          unitPrice,
          newPrice: unitPrice,

          title:
            pickString(
              product?.translations?.ar?.title
            ) ||
            pickString(product?.title) ||
            pickString(
              product?.translations?.fr?.title
            ) ||
            pickString(
              product?.translations?.en?.title
            ),

          coverImage: pickString(
            product?.coverImage
          ),

          color: {
            colorName,
            image: mainImage,

            images: pickedImages.length
              ? [...new Set(pickedImages)]
              : [mainImage].filter(Boolean),
          },

          size: pickString(
            raw?.size || raw?.selectedSize
          ),

          embroideryCategory:
            product.embroideryCategory || null,

          category: pickString(
            product?.category
          ),

          subCategory: pickString(
            product?.subCategory
          ),

          pieces: selectedPieces,
          selectedPieces,

          colorKey: pickString(
            raw?.colorKey
          ),
        })
      );

      reservations.push({
        productId,

        colorId: matchedColor?._id
          ? String(matchedColor._id)
          : "",

        quantity,
      });
    }

    const aggregatedReservations =
      aggregateReservations(reservations);

    for (const item of aggregatedReservations) {
      const product = await Product.findOne({
        productId: item.productId,
      });

      if (!product) {
        throw new Error(
          `المنتج غير موجود أثناء خصم المخزون: ${item.productId}`
        );
      }

      const quantity = ensureMinQty(
        item.quantity,
        1
      );

      const colors = Array.isArray(product.colors)
        ? product.colors
        : [];

      if (item.colorId) {
        const color = colors.find(
          (entry) =>
            String(entry?._id || "") ===
            String(item.colorId)
        );

        if (!color) {
          throw new Error(
            `اللون المحدد غير موجود للمنتج ${item.productId}`
          );
        }

        const currentStock = Math.max(
          0,
          toNum(color.stock, 0)
        );

        if (quantity > currentStock) {
          return res.status(400).json({
            success: false,
            message: `الكمية المطلوبة غير متوفرة للمنتج ${item.productId}. المتوفر حاليًا: ${currentStock}`,
          });
        }

        color.stock =
          currentStock - quantity;
      } else {
        const currentStock = Math.max(
          0,
          toNum(product.stockQuantity, 0)
        );

        if (quantity > currentStock) {
          return res.status(400).json({
            success: false,
            message: `الكمية المطلوبة غير متوفرة للمنتج ${item.productId}. المتوفر حاليًا: ${currentStock}`,
          });
        }

        product.stockQuantity =
          currentStock - quantity;
      }

      recalcProductStockQuantity(product);

      await product.save();

      appliedAdjustments.push({
        productId: item.productId,
        colorId: item.colorId,
        quantity,
      });
    }

    const shipping = Math.max(
      0,
      toNum(body?.totals?.shipping, 0)
    );

    const totals = computeTotalsFromLines(
      normalizedLines,
      shipping
    );

    const year = new Date().getFullYear();

    const rand = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    const orderId = body.orderId
      ? pickString(body.orderId)
      : `WZ-${year}-${rand}`;

    const order = await Order.create({
      name,
      email,
      phone,

      address: addressObj,

      products: normalizedLines,

      totals,

      subtotal: totals.subtotal,
      shipping: totals.shipping,
      totalPrice: totals.total,
      total: totals.total,

      isPaid: false,
      isDelivered: false,

      payment: {
        method: "cod",
      },

      paymentMethod: "cod",

      orderId,

      status: "تم تأكيد الطلب",
    });

    const normalizedSavedOrder =
      await normalizeOrderBeforeSend(order);

    const enriched =
      await hydrateOrderProducts(
        normalizedSavedOrder
      );

    return res.status(201).json({
      success: true,
      order: enriched,
    });
  } catch (error) {
    console.error(
      "createOrder error:",
      error
    );

    if (appliedAdjustments.length) {
      await rollbackStockAdjustments(
        appliedAdjustments
      );
    }

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "فشل إنشاء الطلب.",
    });
  }
};

const trackOrderByOrderId = async (req, res) => {
  try {
    const orderId = pickString(req.params.orderId).toUpperCase();
    const email = pickString(req.query?.email).toLowerCase();

    if (!/^WZ-\d{4}-[A-Z0-9-]{4,30}$/.test(orderId) ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Référence ou adresse e-mail invalide." });
    }

    // Match old records where email casing differs, without a collection scan.
    // MongoDB case-insensitive collation needs a matching index; a bounded
    // anchored regex supports legacy mixed-case values.
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const order = await Order.findOne({
      orderId,
      email: { $regex: `^${escapeRegex(email)}$`, $options: "i" },
    }).lean();

    // Same response for incorrect email and unknown reference.
    if (!order) {
      return res.status(404).json({
        message: "Aucune commande ne correspond à ces informations.",
      });
    }

    const statusLabels = {
      "تم تأكيد الطلب": "Commande confirmée",
      "قيد التحضير": "En préparation",
      "خارج للتسليم": "En cours de livraison",
      "تم التسليم والدفع": "Livrée et payée",
      pending: "Commande confirmée",
      confirmed: "Commande confirmée",
      processing: "En préparation",
      preparing: "En préparation",
      shipped: "En cours de livraison",
      shipping: "En cours de livraison",
      delivered: "Livrée et payée",
    };

    const rawProgress = order.productProgress || {};
    const progress = rawProgress instanceof Map
      ? Object.fromEntries(rawProgress)
      : rawProgress;

    // Resolve missing subcategories from the live product catalog for older orders.
    // Preserve the original order-line subcategory whenever it was saved.
    const missingCategoryIds = [...new Set((order.products || [])
      .filter(line => !String(line?.subCategory || "").trim())
      .map(line => String(line?.productId || "").trim())
      .filter(Boolean))];
    const categoryProducts = missingCategoryIds.length
      ? await Product.find({ productId: { $in: missingCategoryIds } })
          .select("productId subCategory category").lean()
      : [];
    const categoryByProductId = new Map(categoryProducts.map(p => [String(p.productId), p]));

    const products = (order.products || []).map((line, index) => {
      const productId = String(line.productId || "");
      const progressValue = progress[productId] ?? progress[String(index)] ?? null;
      const percent = Number(progressValue);
      return {
        productId,
        title: String(line.title || "Produit"),
        quantity: Number(line.quantity || 1),
        size: String(line.size || ""),
        coverImage: String(line.color?.image || line.color?.images?.[0] || line.coverImage || ""),
        images: [...new Set([line.color?.image, ...(line.color?.images || []), line.coverImage].filter(Boolean).map(String))].slice(0, 6),
        category: String(line.category || categoryByProductId.get(productId)?.category || ""),
        subCategory: String(line.subCategory || categoryByProductId.get(productId)?.subCategory || ""),
        unitPrice: Number(line.unitPrice ?? line.price ?? line.newPrice ?? 0),
        colorName: line.color?.colorName || "",
        pieces: (line.selectedPieces?.length ? line.selectedPieces : line.pieces || [])
          .map(p => ({ name: p.name, quantity: p.quantity })),
        progress: progressValue !== null && Number.isFinite(percent)
          ? Math.max(0, Math.min(100, percent))
          : null,
      };
    });

    const total = Number(
      order.totals?.total || order.totalPrice || order.total || 0
    );

    // Return only what the customer needs to track their order.
    // Do not expose address, phone, internal notes or full admin data.
    return res.status(200).json({
      orderId: order.orderId,
      status: order.status,
      statusLabel: statusLabels[order.status] || "Commande confirmée",
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      carrier: order.carrier || "",
      eta: order.eta || "",
      isDelivered: Boolean(order.isDelivered),
      isPaid: Boolean(order.isPaid),
      paymentMethod: order.paymentMethod || "cod",
      totals: { total, subtotal: Number(order.totals?.subtotal ?? order.subtotal ?? 0), shipping: Number(order.totals?.shipping ?? order.shipping ?? 0) },
      products,
    });
  } catch (error) {
    console.error("trackOrderByOrderId error:", error);
    return res.status(500).json({ message: "Suivi temporairement indisponible." });
  }
};

const getOrderByEmail = async (req, res) => {
  try {
    const email = pickString(
      req.params.email
    ).toLowerCase();

    if (!email) {
      return res.status(400).json([]);
    }

    const orders = await Order.find({
      email,
    }).sort({
      createdAt: 1,
    });

    const normalized = [];

    for (const order of orders || []) {
      await normalizeOrderBeforeSend(order);

      normalized.push(
        await hydrateOrderProducts(order)
      );
    }

    return res
      .status(200)
      .json(normalized);
  } catch (error) {
    console.error(
      "getOrderByEmail error:",
      error
    );

    return res.status(500).json({
      message: "فشل جلب الطلبات.",
    });
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order =
      await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        message: "الطلب غير موجود.",
      });
    }

    await normalizeOrderBeforeSend(order);

    const enriched =
      await hydrateOrderProducts(order);

    return res
      .status(200)
      .json(enriched);
  } catch (error) {
    console.error(
      "getOrderById error:",
      error
    );

    return res.status(500).json({
      message: "فشل جلب الطلب.",
    });
  }
};

const getAllOrders = async (_req, res) => {
  try {
    const orders =
      await Order.find().lean();

    const productIds = [
      ...new Set(
        (orders || [])
          .flatMap((order) =>
            Array.isArray(order.products)
              ? order.products
              : []
          )
          .map((line) =>
            pickString(line?.productId)
          )
          .filter(Boolean)
      ),
    ];

    const products = productIds.length
      ? await Product.find({
          productId: {
            $in: productIds,
          },
        })
          .select(
            "productId title translations embroideryCategory category subCategory colors coverImage newPrice stockQuantity pieces"
          )
          .lean()
      : [];

    const productMap = new Map(
      products.map((product) => [
        pickString(product.productId),
        product,
      ])
    );

    const processed = (orders || []).map(
      (order) => {
        const safeLines = (
          order.products || []
        )
          .filter(
            (line) => line?.productId
          )
          .map((line) => {
            const product =
              productMap.get(
                pickString(
                  line.productId
                )
              );

            const selectedPieces =
              normalizeOrderPieces(
                line?.selectedPieces ||
                  line?.pieces
              );

            return {
              ...normalizeOrderLine(
                line
              ),

              productData:
                product || null,

              category: pickString(
                line?.category ||
                  product?.category
              ),

              subCategory:
                pickString(
                  line?.subCategory ||
                    product?.subCategory
                ),

              embroideryCategory:
                line
                  ?.embroideryCategory ||
                product
                  ?.embroideryCategory ||
                "",

              pieces:
                selectedPieces,

              selectedPieces,
            };
          });

        const status = pickString(
          order?.status
        );

        const safeStatus =
          isValidStatus(status)
            ? status
            : "تم تأكيد الطلب";

        const totals =
          computeTotalsFromLines(
            safeLines,
            toNum(
              order?.totals?.shipping,
              toNum(
                order.shipping,
                0
              )
            )
          );

        return {
          ...order,

          status: safeStatus,

          totals,

          subtotal:
            totals.subtotal,

          shipping:
            totals.shipping,

          totalPrice:
            totals.total,

          total:
            totals.total,

          products: safeLines,
        };
      }
    );

    return res
      .status(200)
      .json(processed);
  } catch (error) {
    console.error(
      "getAllOrders error:",
      error
    );

    return res.status(500).json({
      message: "فشل جلب الطلبات.",
    });
  }
};

const updateOrder = async (req, res) => {
  const { id } = req.params;

  try {
    const order =
      await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        message: "الطلب غير موجود.",
      });
    }

    if (
      req.body?.status !==
      undefined
    ) {
      const next = pickString(
        req.body.status
      );

      if (!isValidStatus(next)) {
        return res.status(400).json({
          message: "الحالة غير صالحة.",
        });
      }

      order.status = next;

      syncExistingProductProgressFromStatus(
        order,
        next
      );

      const delivered =
        next ===
        "تم التسليم والدفع";

      order.isDelivered =
        delivered;

      order.isPaid =
        delivered;
    }

    if (
      req.body?.isPaid !==
      undefined
    ) {
      order.isPaid =
        !!req.body.isPaid;
    }

    if (
      req.body?.isDelivered !==
      undefined
    ) {
      order.isDelivered =
        !!req.body.isDelivered;
    }

    if (
      req.body?.carrier !==
      undefined
    ) {
      order.carrier =
        pickString(
          req.body.carrier
        );
    }

    if (
      req.body?.eta !==
      undefined
    ) {
      order.eta =
        pickString(
          req.body.eta
        );
    }

    if (
      pickString(order.status) ===
      "تم التسليم والدفع"
    ) {
      order.isDelivered = true;
      order.isPaid = true;
    }

    if (
      req.body?.productProgress !==
      undefined
    ) {
      const patch =
        req.body.productProgress;

      if (
        !patch ||
        typeof patch !==
          "object" ||
        Array.isArray(patch)
      ) {
        return res.status(400).json({
          message:
            "productProgress غير صالح.",
        });
      }

      mergeProductProgressIntoOrder(
        order,
        patch
      );
    }

    order.products =
      normalizeOrderProductsArray(
        order.products || []
      );

    const totals =
      computeTotalsFromLines(
        order.products || [],
        toNum(
          order?.totals?.shipping,
          toNum(
            order.shipping,
            0
          )
        )
      );

    order.totals = totals;
    order.subtotal =
      totals.subtotal;
    order.shipping =
      totals.shipping;
    order.totalPrice =
      totals.total;
    order.total =
      totals.total;

    const updatedOrder =
      await order.save();

    const enriched =
      await hydrateOrderProducts(
        updatedOrder
      );

    return res
      .status(200)
      .json(enriched);
  } catch (error) {
    console.error(
      "updateOrder error:",
      {
        message:
          error?.message,

        name:
          error?.name,

        stack:
          error?.stack,

        orderId:
          id,

        body:
          req.body,
      }
    );

    return res.status(500).json({
      message:
        "فشل تحديث الطلب.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error?.message
          : undefined,
    });
  }
};

const removeProductFromOrder = async (req, res) => {
  const {
    orderId,
    productKey,
    quantityToRemove,
  } = req.body;

  try {
    const order =
      await Order.findById(
        orderId
      );

    if (!order) {
      return res.status(404).json({
        message: "الطلب غير موجود.",
      });
    }

    const [productId, colorName] =
      String(
        productKey || ""
      ).split("|");

    let productFound = false;

    const updatedProducts = [];

    for (
      const item of
      order.products || []
    ) {
      const matchesProductId =
        pickString(
          item?.productId
        ) ===
        pickString(productId);

      const itemColorName =
        normalizeColorName(
          item?.color?.colorName
        );

      const matchesColorName =
        itemColorName &&
        itemColorName ===
          pickString(colorName);

      if (
        !matchesProductId ||
        !matchesColorName
      ) {
        updatedProducts.push(
          normalizeOrderLine(
            item
          )
        );

        continue;
      }

      productFound = true;

      const removeQty =
        toNum(
          quantityToRemove,
          0
        );

      const currentQty =
        ensureMinQty(
          item?.quantity,
          1
        );

      if (
        removeQty <= 0 ||
        removeQty >
          currentQty
      ) {
        return res.status(400).json({
          message:
            "الكمية غير صالحة.",
        });
      }

      const newQty =
        currentQty -
        removeQty;

      if (newQty > 0) {
        updatedProducts.push(
          normalizeOrderLine({
            ...(
              item.toObject?.() ??
              item
            ),

            quantity:
              newQty,
          })
        );
      }
    }

    if (!productFound) {
      return res.status(404).json({
        message:
          "المنتج غير موجود داخل الطلب.",
      });
    }

    if (
      !updatedProducts.length
    ) {
      await Order.findByIdAndDelete(
        order._id
      );

      return res.status(200).json({
        message:
          "تم حذف الطلب لأنه أصبح فارغًا.",
      });
    }

    order.products =
      updatedProducts;

    const totals =
      computeTotalsFromLines(
        updatedProducts,

        toNum(
          order?.totals
            ?.shipping,

          toNum(
            order.shipping,
            0
          )
        )
      );

    order.totals =
      totals;

    order.subtotal =
      totals.subtotal;

    order.shipping =
      totals.shipping;

    order.totalPrice =
      totals.total;

    order.total =
      totals.total;

    await order.save();

    return res.status(200).json({
      message:
        "تم تحديث الطلب بنجاح.",

      totals,
    });
  } catch (error) {
    console.error(
      "removeProductFromOrder error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "فشل تحديث الطلب.",
    });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order =
      await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        message:
          "الطلب غير موجود.",
      });
    }

    await Order.findByIdAndDelete(
      id
    );

    return res.status(200).json({
      message:
        "تم حذف الطلب بنجاح.",
    });
  } catch (error) {
    console.error(
      "deleteOrder error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "فشل حذف الطلب.",
    });
  }
};

/* =============================================================================
   PROGRESS KEY
============================================================================= */

/**
 * Progress values stay exactly:
 *
 * 0%
 * 20%
 * 40%
 * 60%
 * 80%
 * 100%
 *
 * Normal product:
 * productId|colorName|lineIndex-itemIndex
 *
 * Product with selected pieces:
 * productId|colorName|lineIndex-pieceIndex-pieceQtyIndex
 */
const parseProgressKey = (productKey = "") => {
  const parts = String(
    productKey || ""
  ).split("|");

  const pid =
    pickString(parts[0]);

  const colorName =
    pickString(parts[1]);

  const last =
    pickString(parts[2]);

  let lineIndex = -1;
  let itemIndex = -1;
  let pieceIndex = -1;
  let pieceQtyIndex = -1;

  if (last) {
    const indexes =
      last.split("-");

    if (
      indexes.length >= 1
    ) {
      lineIndex =
        toNum(
          indexes[0],
          -1
        );
    }

    /*
     * Product with selected piece:
     * lineIndex-pieceIndex-pieceQtyIndex
     */
    if (
      indexes.length >= 3
    ) {
      pieceIndex =
        toNum(
          indexes[1],
          -1
        );

      pieceQtyIndex =
        toNum(
          indexes[2],
          -1
        );
    }

    /*
     * Normal product:
     * lineIndex-itemIndex
     */
    else if (
      indexes.length >= 2
    ) {
      itemIndex =
        toNum(
          indexes[1],
          -1
        );
    }
  }

  return {
    pid,
    colorName,
    lineIndex,
    itemIndex,
    pieceIndex,
    pieceQtyIndex,
  };
};

const pickEmbroideryText = (raw) => {
  if (!raw) return "";

  if (typeof raw === "string") {
    return raw.trim();
  }

  if (typeof raw === "object") {
    return pickString(raw);
  }

  return "";
};

const escapeHtml = (value = "") =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/* =============================================================================
   CATEGORY HELPERS
============================================================================= */

/**
 * Internally normalize all supported category values.
 *
 * Database / frontend values may be:
 *
 * Men
 * Women
 * Children
 *
 * or their French equivalents.
 */
const normalizeProductCategory = (category = "") => {
  const raw = pickString(category);

  if (!raw) return "";

  const normalized = raw
    .toLowerCase()
    .trim();

  if (
    normalized === "men" ||
    normalized === "man" ||
    normalized === "male" ||
    normalized === "homme" ||
    normalized === "hommes"
  ) {
    return "Men";
  }

  if (
    normalized === "women" ||
    normalized === "woman" ||
    normalized === "female" ||
    normalized === "femme" ||
    normalized === "femmes"
  ) {
    return "Women";
  }

  if (
    normalized === "children" ||
    normalized === "child" ||
    normalized === "kids" ||
    normalized === "kid" ||
    normalized === "enfant" ||
    normalized === "enfants"
  ) {
    return "Children";
  }

  return raw;
};

/**
 * Customer-facing category.
 *
 * Men      => Homme
 * Women    => Femme
 * Children => Enfant
 */
const getCategoryLabel = (category = "") => {
  const normalized =
    normalizeProductCategory(
      category
    );

  switch (normalized) {
    case "Men":
      return "Homme";

    case "Women":
      return "Femme";

    case "Children":
      return "Enfant";

    default:
      return normalized;
  }
};

/* =============================================================================
   SEND ORDER NOTIFICATION
============================================================================= */

/**
 * IMPORTANT:
 *
 * No change to your existing alert behavior.
 *
 * Progress values remain:
 *
 * 0%
 * 20%
 * 40%
 * 60%
 * 80%
 * 100%
 *
 * AdminOrdersProgress decides WHEN /notify is called.
 *
 * This controller only improves identification of:
 *
 * - Product
 * - Category
 * - Color
 * - Embroidery
 * - Selected piece
 * - Exact selected-piece unit
 * - Progress
 */
const sendOrderNotification = async (req, res) => {
  try {
    const {
      orderId,
      email,
      progress,
      status,
      productKey,
    } = req.body;

    const safeEmail =
      pickString(email);

    if (
      !safeEmail ||
      !orderId ||
      (
        progress === undefined &&
        !status
      )
    ) {
      return res.status(400).json({
        message:
          "يرجى إدخال البريد ومرجع الطلب والتقدّم (progress أو status).",
      });
    }

    const order =
      await Order.findById(
        orderId
      );

    if (!order) {
      return res.status(404).json({
        message:
          "الطلب غير موجود.",
      });
    }

    if (!order.email || safeEmail.toLowerCase() !== pickString(order.email).toLowerCase()) {
      return res.status(400).json({ message: "Adresse e-mail différente de celle de la commande." });
    }
    if (![60, 100].includes(Number(progress))) {
      return res.status(400).json({ message: "Notifications autorisées uniquement à 60 % et 100 %." });
    }
    if (!pickString(productKey)) {
      return res.status(400).json({ message: "La référence du produit ou de la pièce est obligatoire." });
    }
    const savedProgress = order.productProgress?.get?.(pickString(productKey));
    if (Number(savedProgress) !== Number(progress)) {
      return res.status(409).json({ message: "La progression enregistrée ne correspond pas à la notification demandée." });
    }

    const customerName =
      pickString(
        order.name,
        "عميلنا الكريم"
      );

    const mongoIdShort =
      String(
        order._id
      ).slice(0, 8);

    const trackingId =
      pickString(
        order.orderId,
        "—"
      );

    const pct =
      progress !== undefined
        ? Math.max(
            0,
            Math.min(
              100,
              toNum(
                progress,
                0
              )
            )
          )
        : null;

    let detailsBlock = "";
    let progressLine = "";

    let notificationProductTitle = "";
    let notificationPieceName = "";
    let notificationCategory = "";

    if (pct !== null) {
      progressLine = `
        <div>
          <strong>التقدّم:</strong> ${pct}%
        </div>
      `;
    }

    if (productKey) {
      const {
        pid,
        colorName,
        lineIndex,
        itemIndex,
        pieceIndex,
        pieceQtyIndex,
      } = parseProgressKey(
        productKey
      );

      const lines =
        Array.isArray(
          order.products
        )
          ? order.products
          : [];

      /*
       * Resolve the exact order line first.
       */
      let line =
        lineIndex >= 0 &&
        lineIndex < lines.length
          ? lines[lineIndex]
          : null;

      /*
       * Fallback for older progress keys.
       */
      if (!line && pid) {
        line =
          lines.find(
            (item) =>
              pickString(
                item?.productId
              ) ===
              pickString(pid)
          ) || null;
      }

      const qty =
        ensureMinQty(
          line?.quantity,
          1
        );

      const itemNo =
        itemIndex >= 0
          ? itemIndex + 1
          : null;

      const embroidery =
        pickEmbroideryText(
          line?.embroideryCategory
        );

      const cleanColor =
        colorName ||
        normalizeColorName(
          line?.color?.colorName ||
            "أصلي"
        );

      const selectedPieces =
        normalizeOrderPieces(
          line?.selectedPieces ||
            line?.pieces
        );

      /*
       * Resolve exact selected piece.
       */
      const exactPiece =
        pieceIndex >= 0 &&
        pieceIndex <
          selectedPieces.length
          ? selectedPieces[
              pieceIndex
            ]
          : null;

      const exactPieceName =
        pickString(
          exactPiece?.name
        );

      const exactPieceQty =
        exactPiece
          ? ensureMinQty(
              exactPiece?.quantity,
              1
            )
          : 0;

      const exactPieceNumber =
        exactPiece &&
        pieceQtyIndex >= 0
          ? pieceQtyIndex + 1
          : null;

      /*
       * Resolve product ID.
       */
      const resolvedProductId =
        pickString(
          line?.productId ||
            pid
        );

      /*
       * Resolve Product document.
       *
       * category is fetched from Product as a fallback
       * for old orders that may not have category saved.
       */
      let productDoc = null;

      if (resolvedProductId) {
        productDoc =
          await Product.findOne({
            productId:
              resolvedProductId,
          })
            .select(
              "productId title translations category subCategory"
            )
            .lean();
      }

      /*
       * Resolve product title.
       */
      const productTitle =
        pickString(
          line?.title
        ) ||
        pickString(
          productDoc?.translations
            ?.fr?.title
        ) ||
        pickString(
          productDoc?.title
        ) ||
        pickString(
          productDoc?.translations
            ?.ar?.title
        ) ||
        pickString(
          productDoc?.translations
            ?.en?.title
        ) ||
        resolvedProductId ||
        "—";

      /*
       * Resolve category.
       *
       * Priority:
       *
       * 1. Saved category in Order line
       * 2. Current category in Product document
       */
      const rawCategory =
        pickString(
          line?.category
        ) ||
        pickString(
          productDoc?.category
        );

      /*
       * Customer sees ONLY:
       *
       * Homme
       * Femme
       * Enfant
       *
       * We no longer display:
       *
       * Men (Homme)
       * Women (Femme)
       * Children (Enfant)
       */
      const categoryLabel =
        getCategoryLabel(
          rawCategory
        );

      notificationProductTitle =
        productTitle;

      notificationPieceName =
        exactPieceName;

      notificationCategory =
        categoryLabel;

      /*
       * Selected pieces list.
       */
      const piecesHtml =
        selectedPieces.length
          ? `
            <div>
              <strong>
                القطع المختارة:
              </strong>

              ${selectedPieces
                .map(
                  (piece) =>
                    `${escapeHtml(
                      piece.name
                    )} × ${piece.quantity}`
                )
                .join("، ")}
            </div>
          `
          : "";

      /*
       * Exact piece whose progress is being updated.
       */
      const exactPieceHtml =
        exactPiece
          ? `
            <div
              style="
                margin-top:8px;
                padding:8px;
                border:1px solid #e5e7eb;
                background:#ffffff;
              "
            >
              <div>
                <strong>
                  القطعة المعنية بالتحديث:
                </strong>

                ${escapeHtml(
                  exactPieceName ||
                    "—"
                )}
              </div>

              ${
                exactPieceNumber
                  ? `
                    <div>
                      <strong>
                        رقم القطعة:
                      </strong>

                      ${exactPieceNumber}
                      من
                      ${exactPieceQty}
                    </div>
                  `
                  : ""
              }
            </div>
          `
          : "";

      detailsBlock = `
        <div
          style="
            margin-top:12px;
            padding:12px;
            border:1px solid #e5e7eb;
            background:#fafafa;
          "
          dir="rtl"
        >
          <div
            style="
              font-weight:800;
              margin-bottom:8px;
            "
          >
            تفاصيل المنتج
          </div>

          <div
            style="
              font-size:14px;
              line-height:1.9;
            "
          >
            <div>
              <strong>
                المنتج:
              </strong>

              ${escapeHtml(
                productTitle
              )}
            </div>

            ${
              categoryLabel
                ? `
                  <div>
                    <strong>
                      الفئة:
                    </strong>

                    ${escapeHtml(
                      categoryLabel
                    )}
                  </div>
                `
                : ""
            }

            <div>
              <strong>
                معرّف المنتج:
              </strong>

              <span
                style="
                  direction:ltr;
                  display:inline-block;
                "
              >
                ${escapeHtml(
                  resolvedProductId ||
                    pid ||
                    "—"
                )}
              </span>
            </div>

            <div>
              <strong>
                اللون:
              </strong>

              ${escapeHtml(
                cleanColor ||
                  "أصلي"
              )}
            </div>

            ${
              embroidery
                ? `
                  <div>
                    <strong>
                      التطريز:
                    </strong>

                    ${escapeHtml(
                      embroidery
                    )}
                  </div>
                `
                : ""
            }

            ${piecesHtml}

            ${exactPieceHtml}

            ${
              !exactPiece &&
              itemNo
                ? `
                  <div>
                    <strong>
                      القطعة:
                    </strong>

                    ${itemNo}
                    من
                    ${qty}
                  </div>
                `
                : !exactPiece &&
                  qty > 1
                ? `
                  <div>
                    <strong>
                      عدد القطع:
                    </strong>

                    ${qty}
                  </div>
                `
                : ""
            }

            ${progressLine}
          </div>
        </div>
      `;
    } else if (progressLine) {
      detailsBlock = `
        <div
          style="
            margin-top:12px;
            padding:12px;
            border:1px solid #e5e7eb;
            background:#fafafa;
          "
          dir="rtl"
        >
          <div
            style="
              font-weight:800;
              margin-bottom:8px;
            "
          >
            تحديث التقدّم
          </div>

          <div
            style="
              font-size:14px;
              line-height:1.9;
            "
          >
            ${progressLine}
          </div>
        </div>
      `;
    }

    /*
     * Existing subject/progress behavior stays unchanged.
     */
    const subject =
      pct !== null
        ? `Wahret Zmen — تحديث طلبك (${mongoIdShort}) — ${pct}%`
        : `Wahret Zmen — تحديث طلبك (${mongoIdShort})`;

    const htmlMessage = `
      <div
        style="
          font-family:Arial, sans-serif;
          line-height:1.9;
        "
        dir="rtl"
      >
        <p
          style="
            margin:0 0 10px 0;
          "
        >
          <strong>
            مرحبًا ${escapeHtml(
              customerName
            )}
          </strong>،
        </p>

        <p
          style="
            margin:0 0 10px 0;
          "
        >
          تحديث سريع بخصوص طلبك:
        </p>

        <div
          style="
            padding:12px;
            border:1px solid #e5e7eb;
            background:#ffffff;
          "
        >
          <div
            style="
              font-size:14px;
              line-height:1.9;
            "
          >
            <div>
              <strong>
                مرجع الطلب:
              </strong>

              <span
                style="
                  direction:ltr;
                  display:inline-block;
                "
              >
                ${escapeHtml(
                  mongoIdShort
                )}
              </span>
            </div>

            <div>
              <strong>
                ID تتبّع:
              </strong>

              <span
                style="
                  direction:ltr;
                  display:inline-block;
                "
              >
                ${escapeHtml(
                  trackingId
                )}
              </span>
            </div>
          </div>
        </div>

        ${detailsBlock}

        <p
          style="
            margin-top:14px;
          "
        >
          سنقوم بإعلامك عند حدوث أي تحديث جديد.
        </p>

        <p
          style="
            margin-top:10px;
          "
        >
          شكراً لثقتك بـ
          <strong>
            Wahret Zmen
          </strong>.
        </p>
      </div>
    `;

    // Use the authenticated OVHcloud mailbox for all outgoing notifications.
    // The visitor's address is a recipient, never the SMTP sender.
    await sendProfessionalMail({
      to: pickString(order.email),
      subject,
      html: htmlMessage,
      text: `${subject}\n\n${customerName}\nCommande : ${trackingId}\nProgression : ${pct ?? "—"}%\n`,
    });

    return res.status(200).json({
      message:
        "تم إرسال الإشعار بنجاح.",

      product:
        notificationProductTitle ||
        undefined,

      category:
        notificationCategory ||
        undefined,

      piece:
        notificationPieceName ||
        undefined,
    });
  } catch (error) {
    console.error(
      "sendOrderNotification error:",
      error
    );

    return res.status(500).json({
      message:
        "فشل إرسال الإشعار.",

    });
  }
};

export {
  createOrder,
  trackOrderByOrderId,
  getAllOrders,
  getOrderByEmail,
  getOrderById,
  updateOrder,
  deleteOrder,
  sendOrderNotification,
  removeProductFromOrder,
};