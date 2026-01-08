// src/orders/orders.controller.js

const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const Order = require("./order.model");
const Product = require("../products/product.model");

/* ---------------- Helpers ---------------- */

const pickArabicString = (v, fallback = "") => {
  if (!v) return fallback;
  if (typeof v === "string") return v;
  // legacy objects: { ar, fr, en } or similar
  return v.ar || v.fr || v.en || fallback;
};

const normalizeColorName = (colorName) => pickArabicString(colorName, "أصلي");

/* ---------------- Controllers ---------------- */

/**
 * POST /api/orders
 * Creates an order, computes total server-side, and decrements stock (best effort).
 */
const createOrder = async (req, res) => {
  try {
    const body = req.body || {};

    const name = body.name?.trim();
    const email = body.email?.trim();
    const phone = body.phone?.trim();

    const addressObj = {
      street: body.address?.street || body.street,
      city: body.address?.city || body.city,
      state: body.address?.state || body.state,
      country: body.address?.country || body.country,
      zipcode: body.address?.zipcode || body.zipcode,
    };

    if (!name || !email || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "يرجى إدخال الاسم والبريد والهاتف." });
    }

    if (
      !addressObj.street ||
      !addressObj.city ||
      !addressObj.state ||
      !addressObj.country ||
      !addressObj.zipcode
    ) {
      return res
        .status(400)
        .json({ success: false, message: "العنوان غير مكتمل." });
    }

    const products = Array.isArray(body.products) ? body.products : [];
    if (!products.length) {
      return res
        .status(400)
        .json({ success: false, message: "لا توجد منتجات في الطلب." });
    }

    const normalizedLines = [];

    for (const raw of products) {
      const productId = raw?.productId?._id || raw?.productId;
      const quantity = Number(raw?.quantity || 0);

      if (!mongoose.isValidObjectId(productId)) {
        return res
          .status(400)
          .json({ success: false, message: "معرّف المنتج غير صالح." });
      }
      if (!(quantity > 0)) {
        return res
          .status(400)
          .json({ success: false, message: "الكمية يجب أن تكون أكبر من 0." });
      }

      const p = await Product.findById(productId).select(
        "newPrice coverImage colors embroideryCategory"
      );

      if (!p) {
        return res
          .status(400)
          .json({ success: false, message: "المنتج غير موجود." });
      }

      const unitPrice = Number(p.newPrice || 0);

      const colorName = normalizeColorName(raw?.color?.colorName);
      const colorImage =
        raw?.color?.image || p.coverImage || "/assets/default-image.png";

      normalizedLines.push({
        productId,
        quantity,
        price: Number(unitPrice.toFixed(2)),
        color: { colorName, image: colorImage },
        embroideryCategory: p.embroideryCategory || null,
      });
    }

    const totalPrice = normalizedLines.reduce(
      (sum, l) => sum + Number(l.price || 0) * Number(l.quantity || 0),
      0
    );

    const order = await Order.create({
      name,
      email,
      phone,
      address: addressObj,
      products: normalizedLines,
      totalPrice: Number(totalPrice.toFixed(2)),
      status: "pending",
    });

    // Best-effort stock decrement per color
    for (const line of normalizedLines) {
      try {
        const prod = await Product.findById(line.productId).select(
          "colors stockQuantity"
        );
        if (!prod || !Array.isArray(prod.colors)) continue;

        const wantName = String(line.color?.colorName || "").trim();
        const wantImg = String(line.color?.image || "").trim();

        const idx = prod.colors.findIndex((c) => {
          const haveName = pickArabicString(c?.colorName, "");
          const haveImg = String(c?.image || "").trim();

          if (wantImg && haveImg && wantImg === haveImg) return true;
          if (wantName && haveName && wantName === haveName) return true;

          // legacy: c.colorName could be {en/fr/ar}
          if (typeof c?.colorName === "object") {
            return (
              String(c.colorName.ar || "") === wantName ||
              String(c.colorName.fr || "") === wantName ||
              String(c.colorName.en || "") === wantName
            );
          }

          return false;
        });

        if (idx > -1) {
          const current = Number(prod.colors[idx].stock || 0);
          prod.colors[idx].stock = Math.max(
            0,
            current - Number(line.quantity || 0)
          );

          prod.stockQuantity = prod.colors.reduce(
            (s, c) => s + Number(c.stock || 0),
            0
          );

          await prod.save();
        }
      } catch (e) {
        console.error("Stock decrement failed:", e);
      }
    }

    return res.status(201).json({ success: true, order });
  } catch (err) {
    console.error("createOrder error:", err);
    return res
      .status(500)
      .json({ success: false, message: "فشل إنشاء الطلب." });
  }
};

/**
 * GET /api/orders/email/:email
 */
const getOrderByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    const orders = await Order.find({ email })
      .sort({ createdAt: 1 })
      .populate("products.productId", "title embroideryCategory colors coverImage");

    return res.status(200).json(orders || []);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "فشل جلب الطلبات." });
  }
};

/**
 * GET /api/orders/:id
 */
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).populate(
      "products.productId",
      "title embroideryCategory colors coverImage"
    );

    if (!order) return res.status(404).json({ message: "الطلب غير موجود." });

    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order by ID:", error);
    res.status(500).json({ message: "فشل جلب الطلب." });
  }
};

/**
 * GET /api/orders
 * Admin
 */
const getAllOrders = async (_req, res) => {
  try {
    const orders = await Order.find()
      .populate("products.productId", "title embroideryCategory colors coverImage")
      .lean();

    const processed = (orders || []).map((order) => {
      const safeLines = (order.products || []).filter((line) => line?.productId);
      return {
        ...order,
        products: safeLines.map((product) => ({
          ...product,
          coverImage: product.productId?.coverImage || "/assets/default-image.png",
        })),
      };
    });

    res.status(200).json(processed);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "فشل جلب الطلبات." });
  }
};

/**
 * PATCH /api/orders/:id
 */
const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { isPaid, isDelivered, productProgress } = req.body;

  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      {
        isPaid,
        isDelivered,
        productProgress: productProgress || {},
      },
      { new: true }
    );

    if (!updatedOrder) return res.status(404).json({ message: "الطلب غير موجود." });

    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ message: "فشل تحديث الطلب." });
  }
};

/**
 * POST /api/orders/remove-line
 * body: { orderId, productKey: "productId|colorName", quantityToRemove }
 */
const removeProductFromOrder = async (req, res) => {
  const { orderId, productKey, quantityToRemove } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "الطلب غير موجود." });

    const [productId, colorName] = String(productKey || "").split("|");
    let productFound = false;
    const updatedProducts = [];

    for (const item of order.products || []) {
      const matchesProductId = String(item?.productId) === String(productId);
      const itemColorName = normalizeColorName(item?.color?.colorName);

      const matchesColorName = itemColorName && itemColorName === colorName;

      if (!matchesProductId || !matchesColorName) {
        updatedProducts.push(item);
        continue;
      }

      productFound = true;

      const qtyToRemove = Number(quantityToRemove || 0);
      const currentQty = Number(item?.quantity || 0);

      if (qtyToRemove <= 0 || qtyToRemove > currentQty) {
        return res.status(400).json({ message: "الكمية غير صالحة." });
      }

      const newQty = currentQty - qtyToRemove;
      if (newQty > 0) {
        updatedProducts.push({
          ...(item.toObject?.() ?? item),
          quantity: newQty,
        });
      }

      // Best-effort stock restore
      try {
        const product = await Product.findById(productId);
        if (product && Array.isArray(product.colors)) {
          const idx = product.colors.findIndex((c) => {
            const haveName = pickArabicString(c?.colorName, "");
            return haveName === colorName;
          });

          if (idx !== -1) {
            product.colors[idx].stock = Math.max(
              (product.colors[idx].stock || 0) + qtyToRemove,
              0
            );
          }

          product.stockQuantity = product.colors.reduce(
            (sum, c) => sum + (c?.stock || 0),
            0
          );

          await product.save();
        }
      } catch (stockErr) {
        console.error("restore stock failed:", stockErr);
      }
    }

    if (!productFound) {
      return res.status(404).json({ message: "المنتج غير موجود داخل الطلب." });
    }

    if (updatedProducts.length === 0) {
      await Order.findByIdAndDelete(order._id);
      return res.status(200).json({ message: "تم حذف الطلب لأنه أصبح فارغًا." });
    }

    const allProductDetails = await Product.find({
      _id: { $in: updatedProducts.map((p) => p.productId) },
    });

    const newTotal = updatedProducts.reduce((acc, item) => {
      const prod = allProductDetails.find(
        (p) => String(p._id) === String(item.productId)
      );
      const price = Number(prod?.newPrice || 0);
      return acc + price * Number(item?.quantity || 0);
    }, 0);

    order.products = updatedProducts;
    order.totalPrice = Number(newTotal.toFixed(2));
    await order.save();

    res.status(200).json({ message: "تم تحديث الطلب بنجاح." });
  } catch (error) {
    console.error("❌ Error updating order:", error);
    res.status(500).json({ message: error.message || "فشل تحديث الطلب." });
  }
};

/**
 * DELETE /api/orders/:id
 */
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "الطلب غير موجود." });

    for (const item of order.products || []) {
      try {
        if (!item?.productId) continue;

        const product = await Product.findById(item.productId);
        if (!product) continue;

        const colorNameStr = normalizeColorName(item?.color?.colorName);

        if (colorNameStr && Array.isArray(product.colors)) {
          const idx = product.colors.findIndex((c) => {
            const haveName = pickArabicString(c?.colorName, "");
            return haveName === colorNameStr;
          });

          if (idx !== -1) {
            const qty = Number(item?.quantity || 0);
            product.colors[idx].stock = Math.max(
              (product.colors[idx].stock || 0) + qty,
              0
            );
          }
        }

        product.stockQuantity = (product.colors || []).reduce(
          (sum, c) => sum + (c?.stock || 0),
          0
        );

        await product.save();
      } catch (innerErr) {
        console.error("deleteOrder() restore stock failed:", innerErr);
      }
    }

    await Order.findByIdAndDelete(id);
    return res.status(200).json({ message: "تم حذف الطلب بنجاح." });
  } catch (error) {
    console.error("Error deleting order:", error);
    return res
      .status(500)
      .json({ message: error.message || "فشل حذف الطلب." });
  }
};

/**
 * POST /api/orders/notify
 * body: { orderId, email, productKey: "productId|colorName", progress, articleIndex? }
 */
const sendOrderNotification = async (req, res) => {
  try {
    const { orderId, email, productKey, progress, articleIndex } = req.body;

    if (!email || !productKey || progress === undefined) {
      return res
        .status(400)
        .json({ message: "يرجى إدخال البريد وبيانات المنتج ونسبة التقدم." });
    }

    const order = await Order.findById(orderId).populate(
      "products.productId",
      "title embroideryCategory colors coverImage"
    );

    if (!order) return res.status(404).json({ message: "الطلب غير موجود." });

    const customerName = order.name;
    const shortOrderId = String(order._id).slice(0, 8);
    const [productId, colorName] = productKey.split("|");

    const matchedProduct = order.products.find((p) => {
      const sameProduct = p.productId?._id?.toString() === productId;
      const lineColorName = normalizeColorName(p?.color?.colorName);
      return sameProduct && lineColorName === colorName;
    });

    if (!matchedProduct) {
      return res.status(404).json({ message: "المنتج غير موجود داخل الطلب." });
    }

    const articleText = articleIndex ? ` (قطعة رقم ${articleIndex})` : "";
    const subject =
      Number(progress) === 100
        ? `طلب ${shortOrderId}${articleText} - جاهز للتسليم`
        : `طلب ${shortOrderId}${articleText} - متابعة التنفيذ (${progress}%)`;

    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; line-height: 1.8;" dir="rtl">
        <p><strong>مرحبًا ${customerName}</strong>،</p>
        <p>
          تحديث بخصوص طلبك رقم <strong>${shortOrderId}</strong>${articleText}:
          المنتج <strong>${matchedProduct.productId.title}</strong>
          (اللون: <strong>${colorName}</strong>) أصبح جاهزًا بنسبة
          <strong>${progress}%</strong>.
        </p>
        ${
          Number(progress) === 100
            ? `<p><strong>خبر سار!</strong> المنتج جاهز للتسليم.</p>`
            : `<p>سنقوم بإبلاغك عند حدوث أي تحديث جديد.</p>`
        }
        <p style="margin-top:14px;">شكراً لثقتك بـ <strong>Wahret Zmen</strong>.</p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html: htmlMessage,
    });

    res.status(200).json({ message: "تم إرسال الإشعار بنجاح." });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({
      message: "فشل إرسال الإشعار.",
      error: error.message,
    });
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderByEmail,
  getOrderById,
  updateOrder,
  deleteOrder,
  sendOrderNotification,
  removeProductFromOrder,
};
