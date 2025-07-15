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
const removeProductFromOrder = async (req, res) => {
  const { orderId, productKey, quantityToRemove } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const [productId, colorName] = productKey.split("|");
    let productFound = false;
    const updatedProducts = [];

    for (const item of order.products) {
      const matchesProductId = item.productId.toString() === productId;
      const matchesColorName = typeof item.color?.colorName === "string"
        ? item.color.colorName === colorName
        : Object.values(item.color?.colorName || {}).includes(colorName);

      if (!matchesProductId || !matchesColorName) {
        updatedProducts.push(item); // keep as is
        continue;
      }

      productFound = true;

      if (item.quantity < quantityToRemove) {
        return res.status(400).json({ message: "Cannot remove more than existing quantity" });
      }

      const newQty = item.quantity - quantityToRemove;
      if (newQty > 0) {
        updatedProducts.push({ ...item.toObject(), quantity: newQty });
      }

      // ✅ Update stock in Product DB
      const product = await Product.findById(productId);
      if (product) {
        const colorIndex = product.colors.findIndex((color) =>
          color &&
          color.colorName &&
          (
            color.colorName.en === colorName ||
            color.colorName.fr === colorName ||
            color.colorName.ar === colorName
          )
        );

        if (colorIndex !== -1) {
          const qty = Number(quantityToRemove);

          product.colors[colorIndex].stock = Math.max(
            (product.colors[colorIndex].stock || 0) + qty,
            0
          );

          product.stockQuantity = product.colors.reduce(
            (sum, color) => sum + (color.stock || 0),
            0
          );

          await product.save();
        }
      }
    }

    if (!productFound) {
      return res.status(404).json({ message: "Product not found in order" });
    }

    if (updatedProducts.length === 0) {
      await Order.findByIdAndDelete(order._id);
      return res.status(200).json({ message: "Order deleted because it has no more products" });
    }

    // 🔄 Recalculate total order price
    const allProductDetails = await Product.find({
      _id: { $in: updatedProducts.map((p) => p.productId) },
    });

    const newTotal = updatedProducts.reduce((acc, item) => {
      const prod = allProductDetails.find((p) => p._id.toString() === item.productId.toString());
      const price = prod?.newPrice || 0;
      return acc + price * item.quantity;
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

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔄 Find the order first
    const deletedOrder = await Order.findById(id);
    if (!deletedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // ✅ Loop through all products in the order to restore stock
    for (const item of deletedOrder.products) {
      const product = await Product.findById(item.productId);
      if (product) {
        const colorName =
          typeof item.color.colorName === "object"
            ? item.color.colorName.en
            : item.color.colorName;

        const colorIndex = product.colors.findIndex(
          (color) =>
            color.colorName.en === colorName ||
            color.colorName.fr === colorName ||
            color.colorName.ar === colorName
        );

        if (colorIndex !== -1) {
          // ✅ Restore stock to the color
          product.colors[colorIndex].stock = Math.max(
            (product.colors[colorIndex].stock || 0) + item.quantity,
            0
          );

          // ✅ Recalculate total stock
          product.stockQuantity = product.colors.reduce(
            (sum, c) => sum + (c.stock || 0),
            0
          );

          // ✅ Save updated product
          await product.save();
        }
      }
    }

    // ❌ Only now delete the order from DB
    await Order.findByIdAndDelete(id);

    res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ message: "Failed to delete order" });
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





