const Product = require("./product.model");
const translate = require("translate-google");

// ✅ Helper function to translate 
const translateDetails = async (text, lang) => {
  try {
    return await translate(text, { to: lang });
  } catch (e) {
    console.error(`Translation error (${lang}):`, e);
    return text;
  }
};


// ---------- CREATE ----------
const postAProduct = async (req, res) => {
  try {
    let { title, description, category, newPrice, oldPrice, colors, trending, coverImage } = req.body;

    if (!title || !description || !category || !newPrice || !oldPrice || !Array.isArray(colors) || colors.length === 0) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    // normalize colors -> ensure .images[]
    const normalizedIncoming = colors.map((c) => {
      const images = Array.isArray(c.images) && c.images.length
        ? c.images
        : (c.image ? [c.image] : []); // back-compat
      return { colorName: c.colorName, images, stock: Number(c.stock) || 0 };
    });

    // cover fallback: explicit coverImage or first color’s first image
    const safeCover = coverImage || normalizedIncoming[0]?.images?.[0] || "";

    // translate color names
    const translatedColors = await Promise.all(
      normalizedIncoming.map(async (color) => ({
        colorName: {
          en: color.colorName,
          fr: await translateDetails(color.colorName, "fr"),
          ar: await translateDetails(color.colorName, "ar"),
        },
        images: color.images,
        stock: color.stock,
      }))
    );

    // translations of title/description
    const translations = {
      fr: {
        title: await translateDetails(title, "fr"),
        description: await translateDetails(description, "fr"),
      },
      ar: {
        title: await translateDetails(title, "ar"),
        description: await translateDetails(description, "ar"),
      },
    };

    // stock: sum of color stocks (or keep first if you prefer)
    const stockQuantity = translatedColors.reduce((acc, c) => acc + (c.stock || 0), 0);

    const product = await Product.create({
      title,
      description,
      translations,
      category,
      coverImage: safeCover,
      colors: translatedColors,
      oldPrice,
      newPrice,
      stockQuantity,
      trending,
    });

    res.status(201).json({ success: true, message: "Product created successfully", product });
  } catch (error) {
    console.error("❌ Error creating product:", error);
    res.status(500).json({ success: false, message: "Failed to create product" });
  }
};



// ✅ Get All Products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};



// ✅ Get a Single Product by ID
const getSingleProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ success: false, message: "Failed to fetch product" });
  }
};


// ✅ Update Product and translate after updating
// ---------- UPDATE ----------
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let { title, description, category, newPrice, oldPrice, colors, trending, coverImage } = req.body;

    if (!Array.isArray(colors) || colors.length === 0) {
      return res.status(400).json({ success: false, message: "At least one color must be provided." });
    }

    const normalizedIncoming = colors.map((c) => {
      const images = Array.isArray(c.images) && c.images.length
        ? c.images
        : (c.image ? [c.image] : []); // back-compat
      return { colorName: c.colorName, images, stock: Number(c.stock) || 0 };
    });

    // build raw object first (EN names), then translate
    const base = await Product.findByIdAndUpdate(
      id,
      {
        title,
        description,
        category,
        coverImage: coverImage || normalizedIncoming[0]?.images?.[0] || "",
        colors: normalizedIncoming.map((c) => ({
          colorName: { en: c.colorName }, // translate after
          images: c.images,
          stock: c.stock,
        })),
        oldPrice,
        newPrice,
        stockQuantity: normalizedIncoming.reduce((acc, c) => acc + (c.stock || 0), 0),
        trending,
      },
      { new: true }
    );

    if (!base) return res.status(404).json({ success: false, message: "Product not found!" });

    // translate title/description
    base.translations = {
      en: { title, description },
      fr: { title: await translateDetails(title, "fr"), description: await translateDetails(description, "fr") },
      ar: { title: await translateDetails(title, "ar"), description: await translateDetails(description, "ar") },
    };

    // translate color names
    base.colors = await Promise.all(
      base.colors.map(async (c) => ({
        colorName: {
          en: c.colorName.en,
          fr: await translateDetails(c.colorName.en, "fr"),
          ar: await translateDetails(c.colorName.en, "ar"),
        },
        images: c.images,
        stock: c.stock,
      }))
    );

    await base.save();

    res.status(200).json({ success: true, message: "Product updated successfully", product: base });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ success: false, message: "Failed to update product" });
  }
};

module.exports = {
  postAProduct,
  getAllProducts: async (req, res) => {
    try {
      const products = await Product.find().sort({ createdAt: -1 });
      res.status(200).json(products);
    } catch (e) {
      res.status(500).json({ success: false, message: "Failed to fetch products" });
    }
  },
  getSingleProduct: async (req, res) => {
    try {
      const p = await Product.findById(req.params.id);
      if (!p) return res.status(404).json({ success: false, message: "Product not found!" });
      res.status(200).json(p);
    } catch (e) {
      res.status(500).json({ success: false, message: "Failed to fetch product" });
    }
  },
  updateProduct,
  deleteAProduct: async (req, res) => {
    try {
      const d = await Product.findByIdAndDelete(req.params.id);
      if (!d) return res.status(404).json({ success: false, message: "Product not found!" });
      res.status(200).json({ success: true, message: "Product deleted successfully", product: d });
    } catch (e) {
      res.status(500).json({ success: false, message: "Failed to delete product" });
    }
  },
  updateProductPriceByPercentage: async (req, res) => {
    const { id } = req.params;
    const { percentage } = req.body;
    try {
      const p = await Product.findById(id);
      if (!p) return res.status(404).json({ success: false, message: "Product not found!" });
      const discount = (p.oldPrice * percentage) / 100;
      p.finalPrice = p.oldPrice - discount;
      await p.save();
      res.status(200).json({ success: true, message: "Price updated successfully", finalPrice: p.finalPrice });
    } catch (e) {
      res.status(500).json({ success: false, message: "Failed to update product price" });
    }
  },
};



// ✅ Delete a Product
const deleteAProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      product: deletedProduct,
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ success: false, message: "Failed to delete product" });
  }
};

// ✅ Update product price by percentage
const updateProductPriceByPercentage = async (req, res) => {
  const { id } = req.params;
  const { percentage } = req.body;

  try {
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    const discount = (product.oldPrice * percentage) / 100;
    product.finalPrice = product.oldPrice - discount;

    await product.save();

    res.status(200).json({
      success: true,
      message: "Price updated successfully",
      finalPrice: product.finalPrice,
    });
  } catch (error) {
    console.error("Error updating product price:", error);
    res.status(500).json({ success: false, message: "Failed to update product price" });
  }
};

module.exports = {
  postAProduct,
  getAllProducts,
  getSingleProduct,
  updateProduct,
  deleteAProduct,
  updateProductPriceByPercentage,
};
