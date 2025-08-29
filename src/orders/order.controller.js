const Order = require("./order.model");
const Product = require("../products/product.model.js");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const translate = require("translate-google");


// ✅ Create a New Order
const createAOrder = async (req, res) => {
  try {
    const products = await Promise.all(
      req.body.products.map(async (product) => {
        const productData = await Product.findById(product.productId);
        if (!productData) throw new Error(`Product not found: ${product.productId}`);

        const selectedColor = product?.color?.colorName && typeof product.color.colorName === "object"
          ? product.color
          : {
              colorName: {
                en: product.color?.colorName?.en || product.color?.colorName || "Original",
                fr: product.color?.colorName?.fr || product.color?.colorName || "Original",
                ar: product.color?.colorName?.ar || "أصلي",
              },
              image: product.color?.image || product.coverImage || productData.coverImage,
            };

        return {
          productId: product.productId,
          quantity: product.quantity,
          color: selectedColor,
        };
      })
    );

    const newOrder = new Order({ ...req.body, products });
    const savedOrder = await newOrder.save();

    for (const orderedProduct of products) {
      const product = await Product.findById(orderedProduct.productId);
      if (!product) continue;

      const colorIndex = product.colors.findIndex((color) =>
        color && color.colorName && (
          color.colorName.en === orderedProduct.color.colorName.en ||
          color.colorName.fr === orderedProduct.color.colorName.fr ||
          color.colorName.ar === orderedProduct.color.colorName.ar
        )
      );

      if (colorIndex !== -1) {
        product.colors[colorIndex].stock = Math.max(
          (product.colors[colorIndex].stock || 0) - orderedProduct.quantity,
          0
        );

        product.stockQuantity = product.colors.reduce(
          (sum, color) => sum + (color.stock || 0),
          0
        );

        await product.save();
      }
    }

    res.status(200).json(savedOrder);
  } catch (error) {
    res.status(500).json({ message: error.message || "Failed to create order" });
  }
};


// ✅ Get Orders by Customer Email
const getOrderByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const orders = await Order.find({ email })
      .sort({ createdAt: -1 })
      .populate("products.productId", "title colors coverImage");

    if (!orders || orders.length === 0) {
      return res.status(404).json({ message: "No orders found" });
    }
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ✅ Get a single order by ID
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).populate("products.productId", "title colors coverImage");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order by ID:", error);
    res.status(500).json({ message: "Failed to fetch order by ID" });
  }
};


// ✅ Get All Orders (Admin)
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("products.productId", "title colors coverImage")
      .lean();

    const processedOrders = orders.map(order => ({
      ...order,
      products: order.products.map(product => ({
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

// ✅ Update an Order
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

// ✅ Remove a Product from an Order
// ✅ Remove a Product from an Order (hardened)
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
            (c?.colorName?.en === colorName) ||
            (c?.colorName?.fr === colorName) ||
            (c?.colorName?.ar === colorName)
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

    // Recalculate total order price
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
    order.totalPrice = newTotal;
    await order.save();

    res.status(200).json({ message: "Product updated successfully" });
  } catch (error) {
    console.error("❌ Error updating order:", error);
    res.status(500).json({ message: error.message || "Failed to update order" });
  }
};




// ✅ Delete an Order and restore stock

// ✅ Delete an Order and restore stock (hardened)
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the order first
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

        // Safely resolve the color name as a plain string
        const colorNameStr = (() => {
          const cn = item?.color?.colorName;
          if (!cn) return null;
          if (typeof cn === "string") return cn;
          return cn.en || cn.fr || cn.ar || null;
        })();

        if (colorNameStr && Array.isArray(product.colors)) {
          const idx = product.colors.findIndex((c) =>
            (c?.colorName?.en === colorNameStr) ||
            (c?.colorName?.fr === colorNameStr) ||
            (c?.colorName?.ar === colorNameStr)
          );

          if (idx !== -1) {
            const qty = Number(item?.quantity || 0);
            product.colors[idx].stock = Math.max((product.colors[idx].stock || 0) + qty, 0);
          }
        }

        // Always recompute the product's total stock
        product.stockQuantity = (product.colors || []).reduce(
          (sum, c) => sum + (c?.stock || 0),
          0
        );

        await product.save();
      } catch (innerErr) {
        console.error("deleteOrder() – restore stock failed for item:", item, innerErr);
        // Continue with the rest of the items instead of throwing
      }
    }

    // Finally delete the order
    await Order.findByIdAndDelete(id);

    return res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    return res.status(500).json({ message: error.message || "Failed to delete order" });
  }
};




// ✅ Send Order Notification via Email
const sendOrderNotification = async (req, res) => {
  try {
    const { orderId, email, productKey, progress, articleIndex } = req.body;

    console.log("📩 Incoming Notification Request:", req.body);

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

    // ✅ Build article index text if provided
    const articleText = articleIndex ? ` (Article #${articleIndex})` : "";
    const articleTextAr = articleIndex ? ` (المقالة رقم ${articleIndex})` : "";

    const subject =
      progress === 100
        ? `Commande ${shortOrderId}${articleText} – Votre création est prête !`
        : `Commande ${shortOrderId}${articleText} – Suivi de la confection artisanale (${progress}%)`;

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

    res
      .status(200)
      .json({ message: "Notification sent successfully in French and Arabic." });
  } catch (error) {
    console.error("Error sending notification:", error);
    res
      .status(500)
      .json({ message: "Error sending notification", error: error.message });
  }
};


module.exports = {
  createAOrder,
  getAllOrders,
  getOrderByEmail,
  getOrderById,
  updateOrder,
  deleteOrder,
  sendOrderNotification,
  removeProductFromOrder,
};





