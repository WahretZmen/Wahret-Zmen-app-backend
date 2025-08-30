// src/orders/orders.controller.js

const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const Order = require("./order.model");
const Product = require("../products/product.model");

// -------------------- Helpers --------------------

/** Recompute total on an order document in-memory */
function recomputeTotal(orderDoc) {
  const total = (orderDoc.products || []).reduce((sum, line) => {
    const unit = Number(line.price ?? 0);
    const qty = Number(line.quantity ?? 0);
    return sum + unit * qty;
  }, 0);
  orderDoc.totalPrice = Number(total.toFixed(2));
}

/** Find a line index by product and (optionally) color identity (currently unused) */
function findLineIndex(orderDoc, { productId, colorId, colorName, colorImage }) {
  if (!orderDoc?.products?.length) return -1;

  return orderDoc.products.findIndex((line) => {
    const sameProduct =
      line?.productId && productId && String(line.productId) === String(productId);
    if (!sameProduct) return false;

    if (colorId && line?.color?._id) {
      return String(line.color._id) === String(colorId);
    }
    if (colorName && line?.color?.colorName) {
      const cn = line.color.colorName;
      const asString = cn?.en || cn?.fr || cn?.ar || cn;
      if (typeof asString === "string") {
        return asString.toLowerCase() === String(colorName).toLowerCase();
      }
      return (
        String(cn.en || "").toLowerCase() === String(colorName).toLowerCase() ||
        String(cn.fr || "").toLowerCase() === String(colorName).toLowerCase() ||
        String(cn.ar || "").toLowerCase() === String(colorName).toLowerCase()
      );
    }
    if (colorImage && line?.color?.image) {
      return String(line.color.image) === String(colorImage);
    }
    return true;
  });
}

// -------------------- Controllers --------------------

/**
 * POST /api/orders
 * Create Order (recomputes total server-side and decrements per-color stock best-effort)
 */
const createOrder = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      name,
      email,
      phone,
      address,
      city,
      country,
      state,
      zipcode,
      notes,
      products = [],
    } = body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ success: false, message: "No products in order." });
    }

    // Normalize and validate each line
    const normalizedLines = [];
    for (const raw of products) {
      const productId = raw.productId?._id || raw.productId;
      const quantity = Number(raw.quantity || 0);

      if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ success: false, message: "Invalid productId." });
      }
      if (!(quantity > 0)) {
        return res.status(400).json({ success: false, message: "Quantity must be > 0." });
      }

      // Determine unit price: prefer client-sent price; if absent, read from Product.newPrice
      let unitPrice = Number(raw.price);
      if (!(unitPrice > 0)) {
        const p = await Product.findById(productId).select("newPrice");
        if (!p) {
          return res.status(400).json({ success: false, message: "Product not found." });
        }
        unitPrice = Number(p.newPrice || 0);
      }

      // Normalize color info (optional)
      const color =
        raw.color
          ? {
              _id: raw.color._id || raw.color.colorId || undefined,
              colorName: raw.color.colorName || undefined, // can be multilingual or string
              image: raw.color.image || undefined,
            }
          : raw.colorId || raw.colorImage || raw.colorName
          ? {
              _id: raw.colorId,
              colorName: raw.colorName,
              image: raw.colorImage,
            }
          : undefined;

      normalizedLines.push({
        productId,
        quantity,
        price: Number(unitPrice.toFixed(2)),
        ...(color ? { color } : {}),
      });
    }

    // Recompute total server-side
    const totalPrice = normalizedLines.reduce(
      (sum, l) => sum + Number(l.price || 0) * Number(l.quantity || 0),
      0
    );

    // Create order
    const order = await Order.create({
      name,
      email,
      phone,
      address,
      city,
      country,
      state,
      zipcode,
      notes,
      products: normalizedLines,
      totalPrice: Number(totalPrice.toFixed(2)),
      status: "pending",
    });

    // OPTIONAL: decrement stock per color (best-effort; doesn't fail the order)
    for (const line of normalizedLines) {
      try {
        const prod = await Product.findById(line.productId).select("colors stockQuantity");
        if (!prod) continue;

        let idx = -1;
        if (line.color) {
          idx = prod.colors.findIndex((c) => {
            if (line.color._id && c._id) return String(c._id) === String(line.color._id);
            if (line.color.image && c.image) return String(c.image) === String(line.color.image);
            if (line.color.colorName && c.colorName) {
              const want =
                (line.color.colorName.en ||
                  line.color.colorName.fr ||
                  line.color.colorName.ar ||
                  line.color.colorName) + "";
              const have = (c.colorName?.en || c.colorName?.fr || c.colorName?.ar || c.colorName) + "";
              return want.toLowerCase() === have.toLowerCase();
            }
            return false;
          });
        }

        if (idx > -1) {
          const current = Number(prod.colors[idx].stock || 0);
          prod.colors[idx].stock = Math.max(0, current - Number(line.quantity || 0));
          // Recompute global stock as the sum of per-color stock
          prod.stockQuantity = prod.colors.reduce((s, c) => s + Number(c.stock || 0), 0);
          await prod.save();
        }
      } catch (e) {
        console.error("Stock decrement failed:", e);
      }
    }

    return res.status(201).json({ success: true, order });
  } catch (err) {
    console.error("createOrder error:", err);
    return res.status(500).json({ success: false, message: "Failed to create order" });
  }
};


// GET /api/orders/email/:email
const getOrderByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    
    // Oldest first so #1 is the earliest order
    const orders = await Order.find({ email })
      .sort({ createdAt: 1 })
      .populate("products.productId", "title colors coverImage");

    return res.status(200).json(orders || []);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};


// GET /api/orders/:id
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).populate(
      "products.productId",
      "title colors coverImage"
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order by ID:", error);
    res.status(500).json({ message: "Failed to fetch order by ID" });
  }
};

// GET /api/orders (admin)
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("products.productId", "title colors coverImage")
      .lean();

    const processedOrders = orders.map((order) => ({
      ...order,
      products: order.products.map((product) => ({
        ...product,
        coverImage: product.productId?.coverImage || "/assets/default-image.png",
      })),
    }));

    res.status(200).json(processedOrders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// PUT /api/orders/:id
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

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ message: "Failed to update order" });
  }
};

// POST /api/orders/remove-line
const removeProductFromOrder = async (req, res) => {
  const { orderId, productKey, quantityToRemove } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const [productId, colorName] = String(productKey || "").split("|");
    let productFound = false;
    const updatedProducts = [];

    for (const item of order.products || []) {
      const matchesProductId = String(item?.productId) === String(productId);

      // Handle string or object colorName; also tolerate missing color gracefully
      const itemColorName = (() => {
        const cn = item?.color?.colorName;
        if (!cn) return null;
        if (typeof cn === "string") return cn;
        return cn.en || cn.fr || cn.ar || null;
      })();

      const matchesColorName =
        itemColorName != null && itemColorName === colorName;

      if (!matchesProductId || !matchesColorName) {
        updatedProducts.push(item); // keep as is
        continue;
      }

      productFound = true;

      const qtyToRemove = Number(quantityToRemove || 0);
      const currentQty = Number(item?.quantity || 0);

      if (qtyToRemove <= 0 || qtyToRemove > currentQty) {
        return res.status(400).json({ message: "Invalid quantity to remove" });
      }

      const newQty = currentQty - qtyToRemove;
      if (newQty > 0) {
        updatedProducts.push({ ...item.toObject?.() ?? item, quantity: newQty });
      }

      // Update stock in Product DB, but don't crash if anything is missing
      try {
        const product = await Product.findById(productId);
        if (product && Array.isArray(product.colors)) {
          const idx = product.colors.findIndex((c) =>
            c?.colorName?.en === colorName ||
            c?.colorName?.fr === colorName ||
            c?.colorName?.ar === colorName
          );

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
        console.error("removeProductFromOrder() – failed to update product stock", stockErr);
      }
    }

    if (!productFound) {
      return res.status(404).json({ message: "Product not found in order" });
    }

    if (updatedProducts.length === 0) {
      await Order.findByIdAndDelete(order._id);
      return res.status(200).json({ message: "Order deleted because it has no more products" });
    }

    // Recalculate total order price using current Product.newPrice
    const allProductDetails = await Product.find({
      _id: { $in: updatedProducts.map((p) => p.productId) },
    });

    const newTotal = updatedProducts.reduce((acc, item) => {
      const prod = allProductDetails.find((p) => String(p._id) === String(item.productId));
      const price = Number(prod?.newPrice || 0);
      return acc + price * Number(item?.quantity || 0);
    }, 0);

    order.products = updatedProducts;
    order.totalPrice = Number(newTotal.toFixed(2));
    await order.save();

    res.status(200).json({ message: "Product updated successfully" });
  } catch (error) {
    console.error("❌ Error updating order:", error);
    res.status(500).json({ message: error.message || "Failed to update order" });
  }
};

// DELETE /api/orders/:id
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Restore stock for each item, but never crash on malformed data
    for (const item of order.products || []) {
      try {
        if (!item?.productId) continue;

        const product = await Product.findById(item.productId);
        if (!product) continue;

        const colorNameStr = (() => {
          const cn = item?.color?.colorName;
          if (!cn) return null;
          if (typeof cn === "string") return cn;
          return cn.en || cn.fr || cn.ar || null;
        })();

        if (colorNameStr && Array.isArray(product.colors)) {
          const idx = product.colors.findIndex((c) =>
            c?.colorName?.en === colorNameStr ||
            c?.colorName?.fr === colorNameStr ||
            c?.colorName?.ar === colorNameStr
          );

          if (idx !== -1) {
            const qty = Number(item?.quantity || 0);
            product.colors[idx].stock = Math.max((product.colors[idx].stock || 0) + qty, 0);
          }
        }

        product.stockQuantity = (product.colors || []).reduce(
          (sum, c) => sum + (c?.stock || 0),
          0
        );

        await product.save();
      } catch (innerErr) {
        console.error("deleteOrder() – restore stock failed for item:", item, innerErr);
      }
    }

    await Order.findByIdAndDelete(id);

    return res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    return res.status(500).json({ message: error.message || "Failed to delete order" });
  }
};

// POST /api/orders/notify
const sendOrderNotification = async (req, res) => {
  try {
    const { orderId, email, productKey, progress, articleIndex } = req.body;

    if (!email || !productKey || progress === undefined) {
      return res
        .status(400)
        .json({ message: "Missing email, productKey, or progress value" });
    }

    const order = await Order.findById(orderId).populate(
      "products.productId",
      "title colors coverImage"
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const customerName = order.name;
    const shortOrderId = String(order._id).slice(0, 8);
    const [productId, colorName] = productKey.split("|");

    const matchedProduct = order.products.find(
      (p) =>
        p.productId?._id?.toString() === productId &&
        (p.color?.colorName === colorName ||
          p.color?.colorName?.en === colorName ||
          p.color?.colorName?.fr === colorName ||
          p.color?.colorName?.ar === colorName)
    );

    if (!matchedProduct) {
      return res.status(404).json({ message: "Product not found in order" });
    }

    const articleText = articleIndex ? ` (Article #${articleIndex})` : "";
    const articleTextAr = articleIndex ? ` (المقالة رقم ${articleIndex})` : "";

    const subject =
      progress === 100
        ? `Commande ${shortOrderId}${articleText} – Votre création est prête !`
        : `Commande ${shortOrderId}${articleText} – Suivi de la confection artisanale (${progress}%)`;

    // ✅ FIX: Close the template string with a backtick, not a stray quote
    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p><strong>Cher ${customerName}</strong>,</p>
        <p>
          Votre article <strong>${matchedProduct.productId.title}</strong> (Couleur : <strong>${colorName}</strong>)${articleText}, 
          dans la commande n°${shortOrderId}, est actuellement <strong>terminé à ${progress}%</strong>.
        </p>
        ${
          progress === 100
            ? `<p><strong>Bonne nouvelle !</strong> Votre article est prêt pour la livraison.</p>`
            : `<p>Nous vous tiendrons informé dès qu'il sera terminé.</p>`
        }
        <hr />
        <p dir="rtl"><strong>عزيزي ${customerName}</strong>،</p>
        <p dir="rtl">
          طلبك <strong>${matchedProduct.productId.title}</strong> (اللون: <strong>${colorName}</strong>)${articleTextAr}، 
          برقم ${shortOrderId}، جاهز بنسبة <strong>${progress}%</strong>.
        </p>
        ${
          progress === 100
            ? `<p dir="rtl"><strong>خبر سار!</strong> المنتج جاهز للتسليم.</p>`
            : `<p dir="rtl">سنقوم بإبلاغك عند الانتهاء الكامل.</p>`
        }
      </div>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html: htmlMessage,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Notification sent successfully in French and Arabic." });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ message: "Error sending notification", error: error.message });
  }
};

// -------------------- Exports --------------------

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
