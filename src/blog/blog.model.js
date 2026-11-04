const mongoose = require("mongoose");

const BlogBlockSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["heading", "paragraph", "list", "quote"],
      default: "paragraph",
    },

    text: { type: String, trim: true, default: "" },

    // Rich text HTML from admin editor
    html: { type: String, default: "" },

    // For headings: h2 / h3 / h4
    level: {
      type: Number,
      enum: [2, 3, 4],
      default: 2,
    },

    // Text alignment
    align: {
      type: String,
      enum: ["right", "center", "left", "justify"],
      default: "right",
    },

    items: { type: [String], default: [] },
  },
  { _id: false }
);

const BlogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    excerpt: { type: String, required: true, trim: true },

    coverImage: { type: String, default: "/fav-icon.png", trim: true },
    imageAlt: { type: String, default: "", trim: true },

    category: {
      type: String,
      enum: ["heritage", "jebba", "keswa", "craftsmanship", "styling", "guide"],
      default: "jebba",
    },

    author: { type: String, default: "فريق وهرة زمان", trim: true },
    readTime: { type: String, default: "5 دقائق", trim: true },

    tags: { type: [String], default: [] },
    content: { type: [BlogBlockSchema], default: [] },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },

    isFeatured: { type: Boolean, default: false },

    seoTitle: { type: String, required: true, trim: true },
    metaDescription: { type: String, required: true, trim: true },

    canonicalUrl: { type: String, default: "", trim: true },
    relatedProductsUrl: { type: String, default: "/products", trim: true },
    relatedVideosUrl: { type: String, default: "/videos", trim: true },

    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BlogPostSchema.index({
  title: "text",
  excerpt: "text",
  tags: "text",
  "content.text": "text",
});

module.exports =
  mongoose.models.BlogPost || mongoose.model("BlogPost", BlogPostSchema);