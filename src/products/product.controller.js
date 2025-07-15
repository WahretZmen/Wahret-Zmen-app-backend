const Product = require("./product.model");
const translate = require("translate-google");

// ✅ Helper function to translate 
const translateDetails = async (text, lang) => {
  try {
    return await translate(text, { to: lang });
  } catch (error) {
    console.error(`Translation error (${lang}):`, error);
    return text;
  }
};


const postAProduct = async (req, res) => {
  try {
    let { title, description, category, newPrice, oldPrice, colors, trending } = req.body;

    if (!title || !description || !category || !newPrice || !oldPrice || !Array.isArray(colors) || colors.length === 0) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    const coverImage = colors[0]?.image || "";

    // Translate colors
    const translatedColors = await Promise.all(
      colors.map(async (color) => ({
        colorName: {
          en: color.colorName,
          fr: await translateDetails(color.colorName, "fr") || color.colorName,
          ar: await translateDetails(color.colorName, "ar") || color.colorName,
        },
        image: color.image,
        stock: color.stock,
      }))
    );

    const stockQuantity = translatedColors[0]?.stock || 0;

    // Translate title & description
    const translations = {
      fr: {
        title: await translateDetails(title, "fr") || title,
        description: await translateDetails(description, "fr") || description,
      },
      ar: {
        title: await translateDetails(title, "ar") || title,
        description: await translateDetails(description, "ar") || description,
      },
    };

    const productData = {
      title,
      description,
      translations,
      category,
      coverImage,
      colors: translatedColors,
      oldPrice,
      newPrice,
      finalPrice: newPrice || oldPrice,
      stockQuantity,
      trending,
    };

    const newProduct = new Product(productData);
    await newProduct.save();

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("❌ Error creating product:", error.message, error.stack);
    res.status(500).json({ success: false, message: 'Failed to create product' });
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
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let { title, description, category, newPrice, oldPrice, colors, trending } = req.body;

    if (!Array.isArray(colors) || colors.length === 0) {
      return res.status(400).json({ success: false, message: "At least one color must be provided." });
    }

    const coverImage = colors[0]?.image || "";
    const stockQuantity = colors[0]?.stock || 0;

    const updatedProduct = await Product.findByIdAndUpdate(id, {
      title,
      description,
      category,
      coverImage,
      colors: colors.map((color) => ({
        colorName: { en: color.colorName },
        image: color.image,
        stock: Number(color.stock) || 0,
      })),
      oldPrice,
      newPrice,
      stockQuantity,
      trending,
    }, { new: true });

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    const translations = {
      en: { title, description },
      fr: {
        title: await translateDetails(title, "fr"),
        description: await translateDetails(description, "fr"),
      },
      ar: {
        title: await translateDetails(title, "ar"),
        description: await translateDetails(description, "ar"),
      },
    };

    const translatedColors = await Promise.all(
      updatedProduct.colors.map(async (color) => ({
        colorName: {
          en: color.colorName.en,
          fr: await translateDetails(color.colorName.en, "fr"),
          ar: await translateDetails(color.colorName.en, "ar"),
        },
        image: color.image,
        stock: color.stock,
      }))
    );

    updatedProduct.translations = translations;
    updatedProduct.colors = translatedColors;
    await updatedProduct.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ success: false, message: "Failed to update product" });
  }
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
