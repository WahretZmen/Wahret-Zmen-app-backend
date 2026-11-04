const BlogPost = require("./blog.model");
const cloudinary = require("../utils/cloudinary");

/* =========================================================
   GLOBAL SETTINGS
========================================================= */

const SITE_URL = String(
  process.env.PUBLIC_SITE_URL ||
    "https://www.wahretzmen.com"
)
  .trim()
  .replace(/\/+$/, "");

const FALLBACK_IMAGE = "/fav-icon.png";

const ALLOWED_CATEGORIES = [
  "heritage",
  "jebba",
  "keswa",
  "craftsmanship",
  "styling",
  "guide",
];

const ALLOWED_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "quote",
];

const ALLOWED_ALIGNMENTS = [
  "left",
  "center",
  "right",
  "justify",
];

/* =========================================================
   RICH TEXT SETTINGS
========================================================= */

const ALLOWED_BLOG_FONTS = new Set([
  "Arial",
  "Georgia",
  "Verdana",
  "Times New Roman",
  "Trebuchet MS",
  "Tahoma",
  "Courier New",
]);

const ALLOWED_BLOG_TEXT_SIZES = new Set([
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
  "36px",
  "40px",
  "48px",
  "56px",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

const cleanString = (value = "") =>
  String(value || "").trim();

const escapeHtmlAttribute = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const stripHtml = (html = "") =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/* =========================================================
   SLUG
========================================================= */

const makeSlug = (value = "") =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* =========================================================
   URL HELPERS
========================================================= */

const buildBlogUrl = (slug = "") =>
  slug
    ? `${SITE_URL}/blog/${slug}`
    : `${SITE_URL}/blog`;

const absoluteUrl = (value = "") => {
  const url = cleanString(value);

  if (!url) {
    return `${SITE_URL}${FALLBACK_IMAGE}`;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${SITE_URL}${
    url.startsWith("/") ? url : `/${url}`
  }`;
};

/* =========================================================
   COVER IMAGE NORMALIZATION
========================================================= */

const normalizeCoverImage = (value = "") => {
  const image = cleanString(value);

  if (!image) {
    return FALLBACK_IMAGE;
  }

  if (/^(data:|blob:|javascript:)/i.test(image)) {
    return FALLBACK_IMAGE;
  }

  /*
   * Vite-generated /assets/... URLs should not be
   * stored as dynamic blog images because their hashes
   * can change after a new deployment.
   */
  try {
    const parsed = new URL(image, SITE_URL);
    const site = new URL(SITE_URL);

    if (
      parsed.origin === site.origin &&
      parsed.pathname.startsWith("/assets/")
    ) {
      return FALLBACK_IMAGE;
    }
  } catch {
    if (/^\/?assets\//i.test(image)) {
      return FALLBACK_IMAGE;
    }
  }

  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  return image.startsWith("/")
    ? image
    : `/${image}`;
};

const normalizePostImages = (post) => {
  if (!post) {
    return post;
  }

  return {
    ...post,
    coverImage: normalizeCoverImage(
      post.coverImage
    ),
  };
};

/* =========================================================
   TEXT COLOR VALIDATION
========================================================= */

const isSafeTextColor = (value = "") => {
  const color = cleanString(value);

  if (!color) {
    return false;
  }

  /*
   * HEX:
   * #fff
   * #ffffff
   * #ffffffff
   */
  if (/^#[0-9a-f]{3,8}$/i.test(color)) {
    return true;
  }

  /*
   * RGB / RGBA
   */
  if (
    /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(
      color
    )
  ) {
    return true;
  }

  return false;
};

/* =========================================================
   IMAGE URL VALIDATION
========================================================= */

const isSafeImageUrl = (value = "") => {
  const url = cleanString(value);

  if (!url) {
    return false;
  }

  if (/^(data:|blob:|javascript:)/i.test(url)) {
    return false;
  }

  if (/^https:\/\//i.test(url)) {
    return true;
  }

  if (
    url.startsWith("/") &&
    !url.startsWith("/assets/")
  ) {
    return true;
  }

  return false;
};

/* =========================================================
   LINK VALIDATION
========================================================= */

const isSafeLinkUrl = (value = "") => {
  const url = cleanString(value);

  if (!url) {
    return false;
  }

  return (
    /^https?:\/\//i.test(url) ||
    url.startsWith("/")
  );
};

/* =========================================================
   INLINE STYLE SANITIZER

   THIS IS VERY IMPORTANT.

   These styles are allowed to survive the backend:
   ✓ color
   ✓ font-size
   ✓ font-family
   ✓ font-weight
   ✓ font-style
   ✓ text-decoration
   ✓ text-align
   ✓ line-height
========================================================= */

const sanitizeInlineStyle = (
  style = "",
  tagName = ""
) => {
  const safeRules = [];

  String(style || "")
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .forEach((rule) => {
      const separatorIndex = rule.indexOf(":");

      if (separatorIndex === -1) {
        return;
      }

      const property = rule
        .slice(0, separatorIndex)
        .trim()
        .toLowerCase();

      const rawValue = rule
        .slice(separatorIndex + 1)
        .trim();

      if (!rawValue) {
        return;
      }

      /* =====================================================
         COLOR
      ===================================================== */

      if (property === "color") {
        if (isSafeTextColor(rawValue)) {
          safeRules.push(
            `color: ${rawValue}`
          );
        }

        return;
      }

      /* =====================================================
         FONT SIZE
      ===================================================== */

      if (property === "font-size") {
        const normalizedSize = rawValue
          .toLowerCase()
          .replace(/\s+/g, "");

        if (
          ALLOWED_BLOG_TEXT_SIZES.has(
            normalizedSize
          )
        ) {
          safeRules.push(
            `font-size: ${normalizedSize}`
          );
        }

        return;
      }

      /* =====================================================
         FONT FAMILY
      ===================================================== */

      if (property === "font-family") {
        const normalizedFont = rawValue
          .replace(/["']/g, "")
          .trim();

        if (
          ALLOWED_BLOG_FONTS.has(
            normalizedFont
          )
        ) {
          safeRules.push(
            `font-family: ${normalizedFont}`
          );
        }

        return;
      }

      /* =====================================================
         FONT WEIGHT
      ===================================================== */

      if (property === "font-weight") {
        if (
          /^(normal|bold|[1-9]00)$/i.test(
            rawValue
          )
        ) {
          safeRules.push(
            `font-weight: ${rawValue}`
          );
        }

        return;
      }

      /* =====================================================
         FONT STYLE
      ===================================================== */

      if (property === "font-style") {
        if (
          /^(normal|italic|oblique)$/i.test(
            rawValue
          )
        ) {
          safeRules.push(
            `font-style: ${rawValue}`
          );
        }

        return;
      }

      /* =====================================================
         TEXT DECORATION
      ===================================================== */

      if (property === "text-decoration") {
        if (
          /^(none|underline|line-through|underline line-through|line-through underline)$/i.test(
            rawValue
          )
        ) {
          safeRules.push(
            `text-decoration: ${rawValue}`
          );
        }

        return;
      }

      /* =====================================================
         TEXT ALIGN
      ===================================================== */

      if (property === "text-align") {
        const alignment = rawValue.toLowerCase();

        if (
          ALLOWED_ALIGNMENTS.includes(
            alignment
          )
        ) {
          safeRules.push(
            `text-align: ${alignment}`
          );
        }

        return;
      }

      /* =====================================================
         LINE HEIGHT
      ===================================================== */

      if (property === "line-height") {
        if (
          /^(normal|\d+(?:\.\d+)?|\d+(?:\.\d+)?(?:px|em|rem|%))$/i.test(
            rawValue
          )
        ) {
          safeRules.push(
            `line-height: ${rawValue}`
          );
        }

        return;
      }

      /* =====================================================
         IMAGE-ONLY STYLES
      ===================================================== */

      if (tagName === "img") {
        if (property === "max-width") {
          if (
            rawValue === "100%" ||
            /^\d+(?:\.\d+)?px$/i.test(rawValue)
          ) {
            safeRules.push(
              `max-width: ${rawValue}`
            );
          }

          return;
        }

        if (property === "width") {
          if (
            rawValue === "auto" ||
            rawValue === "100%" ||
            /^\d+(?:\.\d+)?px$/i.test(rawValue)
          ) {
            safeRules.push(
              `width: ${rawValue}`
            );
          }

          return;
        }

        if (property === "height") {
          if (
            rawValue === "auto" ||
            /^\d+(?:\.\d+)?px$/i.test(rawValue)
          ) {
            safeRules.push(
              `height: ${rawValue}`
            );
          }

          return;
        }

        if (property === "display") {
          if (
            /^(block|inline-block)$/i.test(rawValue)
          ) {
            safeRules.push(
              `display: ${rawValue}`
            );
          }

          return;
        }
      }
    });

  return safeRules.join("; ");
};

/* =========================================================
   RICH HTML SANITIZER

   CRITICAL:
   We sanitize dangerous HTML WITHOUT deleting the
   formatting created by BlogPostForm.jsx.
========================================================= */

const sanitizeHtml = (html = "") => {
  let value = String(html || "");

  /* =====================================================
     REMOVE DANGEROUS ELEMENTS
  ===================================================== */

  value = value.replace(
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    ""
  );

  value = value.replace(
    /<style[\s\S]*?>[\s\S]*?<\/style>/gi,
    ""
  );

  value = value.replace(
    /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
    ""
  );

  value = value.replace(
    /<object[\s\S]*?>[\s\S]*?<\/object>/gi,
    ""
  );

  value = value.replace(
    /<embed[\s\S]*?>/gi,
    ""
  );

  /* =====================================================
     REMOVE EVENT HANDLERS
  ===================================================== */

  value = value.replace(
    /\son\w+\s*=\s*"[^"]*"/gi,
    ""
  );

  value = value.replace(
    /\son\w+\s*=\s*'[^']*'/gi,
    ""
  );

  value = value.replace(
    /\son\w+\s*=\s*[^\s>]+/gi,
    ""
  );

  value = value.replace(
    /javascript:/gi,
    ""
  );

  const allowedTags = new Set([
    "p",
    "div",
    "br",

    "span",

    "strong",
    "b",

    "em",
    "i",

    "u",
    "s",

    "a",

    "ul",
    "ol",
    "li",

    "blockquote",

    "h2",
    "h3",
    "h4",

    "img",

    /*
     * Kept for compatibility with older saved posts.
     * New BlogPostForm should use SPAN styles instead.
     */
    "font",
  ]);

  value = value.replace(
    /<\/?([a-z0-9]+)([^>]*)>/gi,
    (match, rawTag, rawAttrs) => {
      const tagName = String(
        rawTag
      ).toLowerCase();

      const attrs = String(
        rawAttrs || ""
      );

      if (!allowedTags.has(tagName)) {
        return "";
      }

      /* ===================================================
         CLOSING TAGS
      =================================================== */

      if (/^<\s*\//.test(match)) {
        if (
          tagName === "img" ||
          tagName === "br"
        ) {
          return "";
        }

        return `</${tagName}>`;
      }

      /* ===================================================
         BR
      =================================================== */

      if (tagName === "br") {
        return "<br>";
      }

      /* ===================================================
         IMAGE
      =================================================== */

      if (tagName === "img") {
        const srcMatch = attrs.match(
          /\bsrc\s*=\s*["']([^"']+)["']/i
        );

        const altMatch = attrs.match(
          /\balt\s*=\s*["']([^"']*)["']/i
        );

        const titleMatch = attrs.match(
          /\btitle\s*=\s*["']([^"']*)["']/i
        );

        const styleMatch = attrs.match(
          /\bstyle\s*=\s*["']([^"']*)["']/i
        );

        const src = srcMatch
          ? cleanString(srcMatch[1])
          : "";

        if (!isSafeImageUrl(src)) {
          return "";
        }

        const alt = altMatch
          ? cleanString(altMatch[1])
          : "";

        const title = titleMatch
          ? cleanString(titleMatch[1])
          : "";

        const safeStyle =
          sanitizeInlineStyle(
            styleMatch
              ? styleMatch[1]
              : "",
            "img"
          );

        return [
          "<img",
          ` src="${escapeHtmlAttribute(src)}"`,
          ` alt="${escapeHtmlAttribute(alt)}"`,
          title
            ? ` title="${escapeHtmlAttribute(
                title
              )}"`
            : "",
          ' loading="lazy"',
          ' decoding="async"',
          ' class="wz-blog-inline-image"',
          safeStyle
            ? ` style="${escapeHtmlAttribute(
                safeStyle
              )}"`
            : "",
          ">",
        ].join("");
      }

      /* ===================================================
         LINKS
      =================================================== */

      if (tagName === "a") {
        const hrefMatch = attrs.match(
          /\bhref\s*=\s*["']([^"']+)["']/i
        );

        const styleMatch = attrs.match(
          /\bstyle\s*=\s*["']([^"']*)["']/i
        );

        const href = hrefMatch
          ? cleanString(hrefMatch[1])
          : "";

        const safeStyle =
          sanitizeInlineStyle(
            styleMatch
              ? styleMatch[1]
              : "",
            "a"
          );

        if (!isSafeLinkUrl(href)) {
          return safeStyle
            ? `<a style="${escapeHtmlAttribute(
                safeStyle
              )}">`
            : "<a>";
        }

        const isExternal =
          /^https?:\/\//i.test(href);

        return [
          "<a",
          ` href="${escapeHtmlAttribute(href)}"`,
          isExternal
            ? ' target="_blank" rel="noopener noreferrer"'
            : "",
          safeStyle
            ? ` style="${escapeHtmlAttribute(
                safeStyle
              )}"`
            : "",
          ">",
        ].join("");
      }

      /* ===================================================
         LEGACY FONT SUPPORT
      =================================================== */

      if (tagName === "font") {
        const faceMatch = attrs.match(
          /\bface\s*=\s*["']([^"']+)["']/i
        );

        const colorMatch = attrs.match(
          /\bcolor\s*=\s*["']([^"']+)["']/i
        );

        const sizeMatch = attrs.match(
          /\bsize\s*=\s*["']?([1-7])["']?/i
        );

        const styleMatch = attrs.match(
          /\bstyle\s*=\s*["']([^"']*)["']/i
        );

        const face = faceMatch
          ? faceMatch[1]
              .replace(/["']/g, "")
              .trim()
          : "";

        const color = colorMatch
          ? cleanString(colorMatch[1])
          : "";

        const legacySize = sizeMatch
          ? sizeMatch[1]
          : "";

        const safeStyle =
          sanitizeInlineStyle(
            styleMatch
              ? styleMatch[1]
              : "",
            "font"
          );

        return [
          "<font",
          ALLOWED_BLOG_FONTS.has(face)
            ? ` face="${escapeHtmlAttribute(face)}"`
            : "",
          isSafeTextColor(color)
            ? ` color="${escapeHtmlAttribute(color)}"`
            : "",
          legacySize
            ? ` size="${legacySize}"`
            : "",
          safeStyle
            ? ` style="${escapeHtmlAttribute(
                safeStyle
              )}"`
            : "",
          ">",
        ].join("");
      }

      /* ===================================================
         NORMAL RICH-TEXT ELEMENTS

         Example:
         <span
           style="
             color: #c62828;
             font-size: 32px;
             font-family: Georgia
           "
         >
      =================================================== */

      const styleMatch = attrs.match(
        /\bstyle\s*=\s*["']([^"']*)["']/i
      );

      const safeStyle =
        sanitizeInlineStyle(
          styleMatch
            ? styleMatch[1]
            : "",
          tagName
        );

      return safeStyle
        ? `<${tagName} style="${escapeHtmlAttribute(
            safeStyle
          )}">`
        : `<${tagName}>`;
    }
  );

  return value.trim();
};

/* =========================================================
   NORMALIZE CONTENT
========================================================= */

const normalizeContent = (content = []) => {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .map((block) => {
      const type =
        ALLOWED_BLOCK_TYPES.includes(
          block?.type
        )
          ? block.type
          : "paragraph";

      /*
       * This is the important value.
       *
       * We keep the rich HTML after sanitization.
       */
      const html = sanitizeHtml(
        block?.html || ""
      );

      const text = cleanString(
        block?.text ||
          stripHtml(html)
      );

      const align =
        ALLOWED_ALIGNMENTS.includes(
          block?.align
        )
          ? block.align
          : "left";

      const level =
        [2, 3, 4].includes(
          Number(block?.level)
        )
          ? Number(block.level)
          : 2;

      const items =
        Array.isArray(block?.items)
          ? block.items
              .map((item) =>
                cleanString(item)
              )
              .filter(Boolean)
          : [];

      return {
        type,
        text,

        /*
         * MUST be stored in MongoDB.
         */
        html,

        level,
        align,
        items,
      };
    })
    .filter(
      (block) =>
        block.text ||
        block.html ||
        block.items.length
    );
};

/* =========================================================
   TAG NORMALIZATION
========================================================= */

const normalizeTags = (tags = []) => {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) =>
      cleanString(tag)
    )
    .filter(Boolean)
    .slice(0, 30);
};

/* =========================================================
   NO CACHE
========================================================= */

const setNoCache = (res) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );

  res.set(
    "Pragma",
    "no-cache"
  );

  res.set(
    "Expires",
    "0"
  );

  res.set(
    "Surrogate-Control",
    "no-store"
  );
};

/* =========================================================
   ARTICLE JSON-LD
========================================================= */

const getArticleJsonLd = (post) => ({
  "@context": "https://schema.org",

  "@type": "BlogPosting",

  headline: post.title,

  description:
    post.metaDescription ||
    post.excerpt,

  image: absoluteUrl(
    post.coverImage
  ),

  datePublished:
    post.publishedAt ||
    post.createdAt,

  dateModified:
    post.updatedAt,

  author: {
    "@type": "Organization",

    name:
      post.author ||
      "Équipe Wahret Zmen",
  },

  publisher: {
    "@type": "Organization",

    name:
      "Wahret Zmen By Sabri | Tunis",

    alternateName:
      "وهرة زمان بإدارة صبري",

    logo: {
      "@type": "ImageObject",

      url:
        `${SITE_URL}/fav-icon.png`,
    },
  },

  mainEntityOfPage: {
    "@type": "WebPage",

    "@id":
      post.canonicalUrl ||
      buildBlogUrl(
        post.slug
      ),
  },

  keywords:
    Array.isArray(post.tags)
      ? post.tags.join(", ")
      : "",

  articleSection:
    post.category,

  inLanguage:
    "fr-TN",
});

/* =========================================================
   BREADCRUMB JSON-LD
========================================================= */

const getBreadcrumbJsonLd = (post) => ({
  "@context": "https://schema.org",

  "@type": "BreadcrumbList",

  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Accueil",
      item: SITE_URL,
    },

    {
      "@type": "ListItem",
      position: 2,
      name: "Blog",
      item: buildBlogUrl(),
    },

    {
      "@type": "ListItem",
      position: 3,
      name: post.title,

      item:
        post.canonicalUrl ||
        buildBlogUrl(
          post.slug
        ),
    },
  ],
});

/* =========================================================
   ADMIN — CLOUDINARY IMAGE UPLOAD
========================================================= */

exports.uploadBlogImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "Aucune image reçue.",
      });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
    ];

    if (
      !allowedTypes.includes(
        req.file.mimetype
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Format non autorisé. Utilisez JPG, PNG, WEBP ou AVIF.",
      });
    }

    if (!req.file.buffer) {
      return res.status(400).json({
        success: false,
        message:
          "Le fichier image est invalide.",
      });
    }

    const result = await new Promise(
      (resolve, reject) => {
        const stream =
          cloudinary.uploader.upload_stream(
            {
              folder:
                "wahret-zmen/blog",

              resource_type:
                "image",
            },

            (error, uploadResult) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(uploadResult);
            }
          );

        stream.end(
          req.file.buffer
        );
      }
    );

    if (!result?.secure_url) {
      throw new Error(
        "Cloudinary n’a retourné aucune URL d’image."
      );
    }

    /*
     * BlogPostForm.jsx expects:
     *
     * response.data.image.url
     */
    return res.status(201).json({
      success: true,

      message:
        "Image téléchargée avec succès.",

      image: {
        url:
          result.secure_url,

        secureUrl:
          result.secure_url,

        publicId:
          result.public_id,

        width:
          result.width,

        height:
          result.height,

        format:
          result.format,

        bytes:
          result.bytes,
      },
    });
  } catch (error) {
    console.error(
      "🔴 uploadBlogImage error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Impossible de télécharger l’image sur Cloudinary.",
    });
  }
};

/* =========================================================
   PUBLIC — GET ALL POSTS
========================================================= */

exports.getPublicBlogPosts = async (
  req,
  res
) => {
  try {
    const posts =
      await BlogPost.find({
        status: "published",
      })
        .sort({
          isFeatured: -1,
          publishedAt: -1,
          createdAt: -1,
        })
        .lean();

    const normalizedPosts =
      posts.map(
        normalizePostImages
      );

    setNoCache(res);

    return res.status(200).json({
      success: true,
      posts:
        normalizedPosts,
    });
  } catch (error) {
    console.error(
      "getPublicBlogPosts error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load blog posts",
    });
  }
};

/* =========================================================
   PUBLIC — GET ONE POST BY SLUG
========================================================= */

exports.getPublicBlogPostBySlug = async (
  req,
  res
) => {
  try {
    const post =
      await BlogPost.findOne({
        slug: req.params.slug,
        status: "published",
      }).lean();

    if (!post) {
      return res.status(404).json({
        success: false,
        message:
          "Blog post not found",
      });
    }

    const normalizedPost =
      normalizePostImages(post);

    const relatedPosts =
      await BlogPost.find({
        _id: {
          $ne: post._id,
        },

        status:
          "published",

        $or: [
          {
            category:
              post.category,
          },

          {
            tags: {
              $in:
                post.tags || [],
            },
          },
        ],
      })
        .sort({
          publishedAt: -1,
          createdAt: -1,
        })
        .limit(3)
        .lean();

    const normalizedRelatedPosts =
      relatedPosts.map(
        normalizePostImages
      );

    setNoCache(res);

    return res.status(200).json({
      success: true,

      /*
       * content[].html is returned unchanged here.
       * That is critical for BlogPost.jsx.
       */
      post:
        normalizedPost,

      relatedPosts:
        normalizedRelatedPosts,

      seo: {
        canonicalUrl:
          normalizedPost.canonicalUrl ||
          buildBlogUrl(
            normalizedPost.slug
          ),

        articleJsonLd:
          getArticleJsonLd(
            normalizedPost
          ),

        breadcrumbJsonLd:
          getBreadcrumbJsonLd(
            normalizedPost
          ),
      },
    });
  } catch (error) {
    console.error(
      "getPublicBlogPostBySlug error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load blog post",
    });
  }
};

/* =========================================================
   ADMIN — GET ALL POSTS
========================================================= */

exports.getAdminBlogPosts = async (
  req,
  res
) => {
  try {
    const {
      status = "all",
      search = "",
    } = req.query;

    const filter = {};

    if (status !== "all") {
      filter.status =
        status;
    }

    if (cleanString(search)) {
      const query =
        cleanString(search);

      filter.$or = [
        {
          title: {
            $regex: query,
            $options: "i",
          },
        },

        {
          slug: {
            $regex: query,
            $options: "i",
          },
        },

        {
          excerpt: {
            $regex: query,
            $options: "i",
          },
        },

        {
          tags: {
            $regex: query,
            $options: "i",
          },
        },

        {
          "content.text": {
            $regex: query,
            $options: "i",
          },
        },
      ];
    }

    const [
      posts,
      total,
      published,
      drafts,
    ] =
      await Promise.all([
        BlogPost.find(filter)
          .sort({
            createdAt: -1,
          })
          .lean(),

        BlogPost.countDocuments(),

        BlogPost.countDocuments({
          status:
            "published",
        }),

        BlogPost.countDocuments({
          status:
            "draft",
        }),
      ]);

    setNoCache(res);

    return res.status(200).json({
      success: true,

      posts:
        posts.map(
          normalizePostImages
        ),

      stats: {
        total,
        published,
        drafts,
      },
    });
  } catch (error) {
    console.error(
      "getAdminBlogPosts error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load admin blog posts",
    });
  }
};

/* =========================================================
   ADMIN — CREATE POST
========================================================= */

exports.createBlogPost = async (
  req,
  res
) => {
  try {
    const body =
      req.body || {};

    const title =
      cleanString(
        body.title
      );

    const slug =
      makeSlug(
        body.slug ||
        title
      );

    if (!title) {
      return res.status(400).json({
        success: false,
        message:
          "Title is required",
      });
    }

    if (!slug) {
      return res.status(400).json({
        success: false,
        message:
          "Slug is required",
      });
    }

    if (
      !cleanString(
        body.excerpt
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Excerpt is required",
      });
    }

    if (
      !cleanString(
        body.seoTitle
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "SEO title is required",
      });
    }

    if (
      !cleanString(
        body.metaDescription
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Meta description is required",
      });
    }

    const existingPost =
      await BlogPost.findOne({
        slug,
      });

    if (existingPost) {
      return res.status(409).json({
        success: false,
        message:
          "Slug already exists. Please use another URL.",
      });
    }

    const status =
      body.status === "published"
        ? "published"
        : "draft";

    const category =
      ALLOWED_CATEGORIES.includes(
        body.category
      )
        ? body.category
        : "jebba";

    const post =
      new BlogPost({
        title,

        slug,

        excerpt:
          cleanString(
            body.excerpt
          ),

        coverImage:
          normalizeCoverImage(
            body.coverImage ||
            FALLBACK_IMAGE
          ),

        imageAlt:
          cleanString(
            body.imageAlt ||
            title
          ),

        category,

        author:
          cleanString(
            body.author ||
            "Équipe Wahret Zmen"
          ),

        readTime:
          cleanString(
            body.readTime ||
            "5 minutes"
          ),

        tags:
          normalizeTags(
            body.tags
          ),

        /*
         * CRITICAL:
         * Save rich HTML.
         */
        content:
          normalizeContent(
            body.content
          ),

        status,

        isFeatured:
          Boolean(
            body.isFeatured
          ),

        seoTitle:
          cleanString(
            body.seoTitle
          ),

        metaDescription:
          cleanString(
            body.metaDescription
          ),

        canonicalUrl:
          cleanString(
            body.canonicalUrl ||
            buildBlogUrl(slug)
          ),

        relatedProductsUrl:
          cleanString(
            body.relatedProductsUrl ||
            "/products"
          ),

        relatedVideosUrl:
          cleanString(
            body.relatedVideosUrl ||
            "/videos"
          ),

        publishedAt:
          status === "published"
            ? new Date()
            : null,
      });

    await post.save();

    setNoCache(res);

    return res.status(201).json({
      success: true,

      message:
        "Blog post created successfully",

      post:
        normalizePostImages(
          post.toObject()
        ),
    });
  } catch (error) {
    console.error(
      "createBlogPost error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Failed to create blog post",
    });
  }
};

/* =========================================================
   ADMIN — UPDATE POST
========================================================= */

exports.updateBlogPost = async (
  req,
  res
) => {
  try {
    const body =
      req.body || {};

    const currentPost =
      await BlogPost.findById(
        req.params.id
      );

    if (!currentPost) {
      return res.status(404).json({
        success: false,
        message:
          "Blog post not found",
      });
    }

    /* =====================================================
       SLUG
    ===================================================== */

    let nextSlug =
      currentPost.slug;

    if (body.slug !== undefined) {
      const generatedSlug =
        makeSlug(
          body.slug ||
          body.title ||
          currentPost.title
        );

      if (generatedSlug) {
        nextSlug =
          generatedSlug;
      }
    }

    const existingPost =
      await BlogPost.findOne({
        slug: nextSlug,

        _id: {
          $ne:
            currentPost._id,
        },
      });

    if (existingPost) {
      return res.status(409).json({
        success: false,
        message:
          "Slug already exists. Please use another URL.",
      });
    }

    /* =====================================================
       STATUS
    ===================================================== */

    const requestedStatus =
      body.status !== undefined
        ? body.status
        : currentPost.status;

    const normalizedStatus =
      requestedStatus === "published"
        ? "published"
        : "draft";

    const shouldSetPublishedAt =
      currentPost.status !== "published" &&
      normalizedStatus === "published";

    const shouldRemovePublishedAt =
      normalizedStatus === "draft";

    /* =====================================================
       UPDATE
    ===================================================== */

    const updatePayload = {
      title:
        body.title !== undefined
          ? cleanString(
              body.title
            )
          : currentPost.title,

      slug:
        nextSlug,

      excerpt:
        body.excerpt !== undefined
          ? cleanString(
              body.excerpt
            )
          : currentPost.excerpt,

      coverImage:
        body.coverImage !== undefined
          ? normalizeCoverImage(
              body.coverImage ||
              FALLBACK_IMAGE
            )
          : normalizeCoverImage(
              currentPost.coverImage
            ),

      imageAlt:
        body.imageAlt !== undefined
          ? cleanString(
              body.imageAlt
            )
          : currentPost.imageAlt,

      category:
        body.category !== undefined &&
        ALLOWED_CATEGORIES.includes(
          body.category
        )
          ? body.category
          : currentPost.category,

      author:
        body.author !== undefined
          ? cleanString(
              body.author ||
              "Équipe Wahret Zmen"
            )
          : currentPost.author,

      readTime:
        body.readTime !== undefined
          ? cleanString(
              body.readTime ||
              "5 minutes"
            )
          : currentPost.readTime,

      tags:
        body.tags !== undefined
          ? normalizeTags(
              body.tags
            )
          : currentPost.tags,

      /*
       * ===================================================
       * MOST IMPORTANT PART FOR YOUR TEXT TOOLS
       * ===================================================
       *
       * BlogPostForm sends:
       *
       * content[x].html
       *
       * Example:
       *
       * <span
       *   style="
       *     color: #c62828;
       *     font-size: 32px;
       *     font-family: Georgia
       *   "
       * >
       *   My text
       * </span>
       *
       * normalizeContent() sanitizes it while PRESERVING
       * those safe styles.
       */
      content:
        body.content !== undefined
          ? normalizeContent(
              body.content
            )
          : currentPost.content,

      status:
        normalizedStatus,

      isFeatured:
        body.isFeatured !== undefined
          ? Boolean(
              body.isFeatured
            )
          : currentPost.isFeatured,

      seoTitle:
        body.seoTitle !== undefined
          ? cleanString(
              body.seoTitle
            )
          : currentPost.seoTitle,

      metaDescription:
        body.metaDescription !== undefined
          ? cleanString(
              body.metaDescription
            )
          : currentPost.metaDescription,

      canonicalUrl:
        body.canonicalUrl !== undefined
          ? cleanString(
              body.canonicalUrl ||
              buildBlogUrl(
                nextSlug
              )
            )
          : cleanString(
              currentPost.canonicalUrl ||
              buildBlogUrl(
                nextSlug
              )
            ),

      relatedProductsUrl:
        body.relatedProductsUrl !== undefined
          ? cleanString(
              body.relatedProductsUrl ||
              "/products"
            )
          : currentPost.relatedProductsUrl,

      relatedVideosUrl:
        body.relatedVideosUrl !== undefined
          ? cleanString(
              body.relatedVideosUrl ||
              "/videos"
            )
          : currentPost.relatedVideosUrl,

      ...(shouldSetPublishedAt
        ? {
            publishedAt:
              new Date(),
          }
        : {}),

      ...(shouldRemovePublishedAt
        ? {
            publishedAt:
              null,
          }
        : {}),
    };

    const updatedPost =
      await BlogPost.findByIdAndUpdate(
        req.params.id,
        updatePayload,
        {
          new: true,
          runValidators: true,
        }
      );

    setNoCache(res);

    return res.status(200).json({
      success: true,

      message:
        "Blog post updated successfully",

      post:
        normalizePostImages(
          updatedPost.toObject()
        ),
    });
  } catch (error) {
    console.error(
      "updateBlogPost error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        error?.message ||
        "Failed to update blog post",
    });
  }
};

/* =========================================================
   ADMIN — TOGGLE STATUS
========================================================= */

exports.toggleBlogPostStatus = async (
  req,
  res
) => {
  try {
    const post =
      await BlogPost.findById(
        req.params.id
      );

    if (!post) {
      return res.status(404).json({
        success: false,
        message:
          "Blog post not found",
      });
    }

    post.status =
      post.status === "published"
        ? "draft"
        : "published";

    post.publishedAt =
      post.status === "published"
        ? new Date()
        : null;

    await post.save();

    setNoCache(res);

    return res.status(200).json({
      success: true,

      message:
        post.status === "published"
          ? "Blog post published successfully"
          : "Blog post moved to draft",

      post:
        normalizePostImages(
          post.toObject()
        ),
    });
  } catch (error) {
    console.error(
      "toggleBlogPostStatus error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to toggle blog post status",
    });
  }
};

/* =========================================================
   ADMIN — DELETE
========================================================= */

exports.deleteBlogPost = async (
  req,
  res
) => {
  try {
    const post =
      await BlogPost.findByIdAndDelete(
        req.params.id
      );

    if (!post) {
      return res.status(404).json({
        success: false,
        message:
          "Blog post not found",
      });
    }

    setNoCache(res);

    return res.status(200).json({
      success: true,
      message:
        "Blog post deleted successfully",
    });
  } catch (error) {
    console.error(
      "deleteBlogPost error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to delete blog post",
    });
  }
};