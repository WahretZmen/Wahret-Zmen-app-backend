const pickDefault = (m) =>
  m && typeof m === "object" && "default" in m ? m.default : m;

const Product = pickDefault(require("../products/product.model"));
const BlogPost = pickDefault(require("../blog/blog.model"));

const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://www.wahretzmen.com")
  .trim()
  .replace(/\/+$/, "");

/* ============================================================================
   ABOUT GALLERY — GOOGLE IMAGES SEO
============================================================================ */

/*
 * IMPORTANT:
 *
 * Vite hashes files imported from /src/assets in production.
 * The backend therefore MUST NOT guess the generated Vite URLs.
 *
 * For maximum Google Images SEO, expose the About gallery with stable public
 * URLs and provide them through:
 *
 * ABOUT_GALLERY_IMAGE_URLS=
 * https://www.wahretzmen.com/images/about/image-1.avif,
 * https://www.wahretzmen.com/images/about/image-2.avif
 *
 * The About page itself remains crawlable even when this variable is empty,
 * provided About.jsx renders normal <img src="..."> elements.
 */

const ABOUT_GALLERY_IMAGE_URLS = String(
  process.env.ABOUT_GALLERY_IMAGE_URLS || ""
)
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^https?:\/\//i.test(value));

const ABOUT_GALLERY_LASTMOD =
  process.env.ABOUT_GALLERY_LASTMOD || "2026-08-22T00:00:00+01:00";

/* ============================================================================
   GLOBAL SEO KEYWORDS
============================================================================ */

const GLOBAL_SEO_KEYWORDS = [
  "Wahret Zmen",
  "Wahret Zmen by Sabri",
  "Wahret Zmen By Sabri | Tunis",
  "wahret zmen",
  "wahretzmen",
  "wahretzmen.com",

  "وهرة زمان",
  "وهرة زمان بإدارة صبري",
  "وهرة زمان تونس",

  "Jebba",
  "Tunisian Jebba",
  "Traditional Jebba",
  "Traditional Tunisian Jebba",

  "traditional outfit",
  "traditional Tunisian outfit",
  "traditional clothes",
  "traditional clothing",
  "traditional Tunisian clothes",
  "traditional Tunisian clothing",
  "Tunisian outfit",
  "Tunisian traditional outfit",
  "Tunisian traditional clothing",

  "Jebba tunisienne",
  "jebba tunisienne",
  "Jebba traditionnelle",
  "jebba traditionnelle",

  "Keswa",
  "keswa",
  "Keswa traditionnelle",
  "keswa traditionnelle",

  "vêtement traditionnel",
  "vetement traditionnel",
  "vêtements traditionnels",
  "vetements traditionnels",
  "vêtement traditionnel tunisien",
  "vetement traditionnel tunisien",
  "vêtements traditionnels tunisiens",
  "vetements traditionnels tunisiens",
  "tenue traditionnelle tunisienne",

  "جبة",
  "جبّة",
  "جبة تونسية",
  "جبّة تونسية",
  "جبة تقليدية",
  "جبّة تقليديّة",
  "جبة تونسية تقليدية",
  "جبّة تونسيّة تقليديّة",

  "كسوة",
  "كسوة تونسية",
  "كسوة تقليدية",
  "كسوة تونسية تقليدية",

  "ملابس تقليدية",
  "ملابس تقليديّة",
  "ملابس تونسية",
  "ملابس تقليدية تونسية",
  "ملابس تقليديّة تونسيّة",

  "لباس تونسي",
  "لباس تونسيّ",
  "لباس تقليدي",
  "لباس تقليديّ",
  "لباس تقليدي تونسي",

  "أزياء تونسية تقليدية",
  "أزياء تقليدية تونسية",
];

/* ============================================================================
   STATIC VIDEO SEO
============================================================================ */

const VIDEO_PAGES = [
  {
    pagePath: "/videos/tunisian-royal-red-couple",
    videoPath:
      "/videos/bdfe928a-e05e-4de8-89cb-3f5acb584fcb.mp4",
    thumbnailPath:
      "/videos/posters/bdfe928a-e05e-4de8-89cb-3f5acb584fcb.webp",
    title: "L’élégance tunisienne en rouge impérial",
    description:
      "Une mise en scène prestigieuse réunissant une jebba masculine et une création féminine aux nuances rouges profondes. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT30S",
    priority: "0.95",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/silver-blue-embroidery-closeup",
    videoPath:
      "/videos/3b4f6927-2e0a-47ae-943e-8a6506596737.mp4",
    thumbnailPath:
      "/videos/posters/3b4f6927-2e0a-47ae-943e-8a6506596737.webp",
    title: "La lumière des broderies argentées",
    description:
      "Un regard rapproché sur une création bleu clair illuminée par des broderies argentées et dorées. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT25S",
    priority: "0.93",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/black-gold-tunisian-elegance",
    videoPath:
      "/videos/bc7afade-7be9-44c4-be8b-f6dee3f2382a.mp4",
    thumbnailPath:
      "/videos/posters/bc7afade-7be9-44c4-be8b-f6dee3f2382a.webp",
    title: "La puissance du noir et de l’or",
    description:
      "Une silhouette noire majestueuse structurée par des ornements dorés et inspirée du patrimoine tunisien. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT32S",
    priority: "0.93",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/burgundy-embroidered-caftan",
    videoPath:
      "/videos/1bdf600d-0f8e-4b7a-96a2-5b59c7353f17.mp4",
    thumbnailPath:
      "/videos/posters/1bdf600d-0f8e-4b7a-96a2-5b59c7353f17.webp",
    title: "Le raffinement d’une création bordeaux brodée",
    description:
      "Une création bordeaux généreusement brodée dans un décor tunisien authentique. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT24S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/white-gold-tunisian-outfit-seated",
    videoPath:
      "/videos/2930b467-45c0-4d82-b546-893abd507e9d.mp4",
    thumbnailPath:
      "/videos/posters/2930b467-45c0-4d82-b546-893abd507e9d.webp",
    title: "La douceur du blanc rehaussée d’or",
    description:
      "Une tenue blanche fluide aux détails dorés mise en valeur par une composition lumineuse. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT22S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/burgundy-vest-traditional-look",
    videoPath:
      "/videos/41f6e9bb-f0c6-4695-99df-2c83316faab0.mp4",
    thumbnailPath:
      "/videos/posters/41f6e9bb-f0c6-4695-99df-2c83316faab0.webp",
    title: "Le charme d’un gilet bordeaux traditionnel",
    description:
      "Une silhouette associant dentelle blanche et gilet bordeaux brodé. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT20S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/sky-blue-traditional-dress-portrait",
    videoPath:
      "/videos/4a670bfc-e1d3-4091-b17a-3140bd73ebbc.mp4",
    thumbnailPath:
      "/videos/posters/4a670bfc-e1d3-4091-b17a-3140bd73ebbc.webp",
    title: "Une silhouette bleu ciel pleine de grâce",
    description:
      "Une présentation portrait mettant en avant la fluidité et la finesse d’une tenue bleu ciel. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT25S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/lavender-tunisian-caftan",
    videoPath:
      "/videos/79244a6a-072a-4042-bd0e-dc5444bce9a8.mp4",
    thumbnailPath:
      "/videos/posters/79244a6a-072a-4042-bd0e-dc5444bce9a8.webp",
    title: "La douceur contemporaine du lavande",
    description:
      "Une création lavande légère associant volumes fluides et détails blancs. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT20S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/aqua-gold-balcony-look",
    videoPath:
      "/videos/7ab47ef5-5507-430d-8a27-c6c0ba750c52.mp4",
    thumbnailPath:
      "/videos/posters/7ab47ef5-5507-430d-8a27-c6c0ba750c52.webp",
    title: "Le bleu aqua illuminé par l’or",
    description:
      "Une tenue bleu aqua aux détails dorés présentée avec amplitude et grâce. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT26S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/black-gold-full-length",
    videoPath:
      "/videos/7e0c3b36-9be6-47f4-a2bc-621b698af7ed.mp4",
    thumbnailPath:
      "/videos/posters/7e0c3b36-9be6-47f4-a2bc-621b698af7ed.webp",
    title: "Une silhouette noire majestueuse",
    description:
      "Une création noire longue enrichie de motifs dorés. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT19S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/black-gold-embroidered-cape",
    videoPath:
      "/videos/8eb9bcb7-5d94-4223-b83d-6eb14d9ac864.mp4",
    thumbnailPath:
      "/videos/posters/8eb9bcb7-5d94-4223-b83d-6eb14d9ac864.webp",
    title: "Le noir brodé dans toute sa splendeur",
    description:
      "Une cape noire aux ornements dorés filmée au plus près. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT34S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/white-sleeve-gold-detail",
    videoPath:
      "/videos/acaae437-9d58-4d96-88b9-cd48e2874447.mp4",
    thumbnailPath:
      "/videos/posters/acaae437-9d58-4d96-88b9-cd48e2874447.webp",
    title: "Le détail doré qui signe l’élégance",
    description:
      "Un focus délicat sur une finition blanche bordée d’or. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT35S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/burgundy-studio-elegance",
    videoPath:
      "/videos/3f994224-25b8-4faf-9f22-c463b10ff31d.mp4",
    thumbnailPath:
      "/videos/posters/3f994224-25b8-4faf-9f22-c463b10ff31d.webp",
    title: "L’élégance bordeaux en lumière",
    description:
      "Une création bordeaux raffinée présentée dans une composition sobre et élégante. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT33S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/black-gold-studio-cape",
    videoPath:
      "/videos/40c78b3d-df1d-467d-a8ca-8f682ed81bde.mp4",
    thumbnailPath:
      "/videos/posters/40c78b3d-df1d-467d-a8ca-8f682ed81bde.webp",
    title: "Une cape noire au prestige doré",
    description:
      "Une cape noire structurée par des finitions dorées dans une présentation contemporaine. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT33S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/black-gold-studio-portrait",
    videoPath:
      "/videos/5318daa8-4cd1-4316-8a70-b3505b39af02.mp4",
    thumbnailPath:
      "/videos/posters/5318daa8-4cd1-4316-8a70-b3505b39af02.webp",
    title: "Portrait d’une élégance noire et dorée",
    description:
      "Une présentation rapprochée révélant la richesse graphique des broderies. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT30S",
    priority: "0.85",
    changefreq: "monthly",
  },

  {
    pagePath: "/videos/powder-blue-studio-look",
    videoPath:
      "/videos/81e6ab5d-58a7-4def-8470-8b5638883db9.mp4",
    thumbnailPath:
      "/videos/posters/81e6ab5d-58a7-4def-8470-8b5638883db9.webp",
    title: "La douceur d’un bleu poudré",
    description:
      "Une création bleu poudré fluide et lumineuse à l’élégance naturelle. Vidéo courte Wahret Zmen consacrée à la mode et au savoir-faire traditionnel tunisien.",
    uploadDate: "2026-07-25T00:00:00+01:00",
    duration: "PT33S",
    priority: "0.85",
    changefreq: "monthly",
  },
];

const VIDEO_METADATA_LAST_MODIFIED =
  "2026-08-20T00:00:00+01:00";

/* ============================================================================
   STATIC INDEXABLE PAGES
============================================================================ */

const STATIC_PAGES = [
  {
    path: "/",
    priority: "1.0",
    changefreq: "daily",
  },
  {
    path: "/products",
    priority: "0.95",
    changefreq: "daily",
  },
  {
    path: "/blog",
    priority: "0.94",
    changefreq: "daily",
  },
  {
    path: "/videos",
    priority: "0.93",
    changefreq: "weekly",
  },
  {
    path: "/about",
    priority: "0.90",
    changefreq: "monthly",
  },
  {
    path: "/contact",
    priority: "0.80",
    changefreq: "monthly",
  },
];

/* ============================================================================
   GENERIC HELPERS
============================================================================ */

const getCanonicalBaseUrl = () =>
  SITE_URL.replace(/\/+$/, "");

const escapeXml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toIsoDate = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().split("T")[0];
  }

  return date.toISOString().split("T")[0];
};

const toIsoDateTime = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
};

const safeText = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const unique = (arr = []) =>
  [...new Set(arr.filter(Boolean))];

const pickLangText = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    return safeText(value);
  }

  if (typeof value === "object") {
    return safeText(
      value.fr ||
        value.ar ||
        value.en ||
        ""
    );
  }

  return "";
};

const normalizeProductPathId = (id) =>
  encodeURIComponent(
    String(id || "").trim()
  );

const absoluteUrl = (baseUrl, value = "") => {
  const raw = String(value || "").trim();

  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }

  if (raw.startsWith("/")) {
    return `${baseUrl}${raw}`;
  }

  return `${baseUrl}/${raw.replace(/^\/+/, "")}`;
};

/* ============================================================================
   PRODUCT HELPERS
============================================================================ */

const getProductRouteSegment = (product = {}) =>
  normalizeProductPathId(
    product?.productId ||
      product?.id ||
      product?._id ||
      product?.slug ||
      ""
  );

const getProductUrl = (baseUrl, product) =>
  `${baseUrl}/products/${getProductRouteSegment(product)}`;

const getProductLastmod = (product) =>
  toIsoDate(
    product?.updatedAt ||
      product?.createdAt
  );

const getColorStockTotal = (colors = []) =>
  Array.isArray(colors)
    ? colors.reduce(
        (sum, color) =>
          sum +
          Math.max(
            0,
            Number(color?.stock || 0)
          ),
        0
      )
    : 0;

const getEffectiveStock = (product = {}) => {
  const stockQuantity = Math.max(
    0,
    Number(product?.stockQuantity || 0)
  );

  const colorsStock = getColorStockTotal(
    product?.colors || []
  );

  return Math.max(
    stockQuantity,
    colorsStock
  );
};

const getProductPriority = (product = {}) => {
  if (product?.trending) {
    return "0.95";
  }

  if (getEffectiveStock(product) > 0) {
    return "0.85";
  }

  return "0.60";
};

const normalizeSubCategoryKey = (value = "") => {
  const key = safeText(value).toLowerCase();

  if (
    [
      "jebba",
      "jebbah",
      "جبة",
      "جبّة",
    ].includes(key)
  ) {
    return "jebba";
  }

  if (
    [
      "keswa",
      "كسوة",
    ].includes(key)
  ) {
    return "keswa";
  }

  if (
    [
      "vest",
      "gilet",
      "فرملة",
      "صدريّة",
      "صدرية",
    ].includes(key)
  ) {
    return "vest";
  }

  if (
    [
      "costume",
      "suit",
      "بدلة",
    ].includes(key)
  ) {
    return "costume";
  }

  if (
    [
      "mens_abaya",
      "mens abaya",
      "عباية رجالي",
      "عباية رجالية",
    ].includes(key)
  ) {
    return "mens_abaya";
  }

  if (
    [
      "accessories",
      "accessory",
      "إكسسوارات",
      "اكسسوارات",
    ].includes(key)
  ) {
    return "accessories";
  }

  return key;
};

const getFrenchSeoFamilyName = (product = {}) => {
  const subKey =
    normalizeSubCategoryKey(
      product?.subCategory
    );

  const map = {
    jebba: "Jebba tunisienne",
    keswa: "Keswa tunisienne",
    vest: "Farmla tunisienne",
    costume: "Costume tunisien",
    mens_abaya: "Abaya homme",
    accessories:
      "Accessoire traditionnel tunisien",
  };

  return (
    map[subKey] ||
    pickLangText(product?.subCategory) ||
    "Vêtement traditionnel tunisien"
  );
};

const getProductTitle = (product = {}) => {
  const translatedTitle =
    pickLangText(product?.translations?.title);

  const title =
    translatedTitle ||
    pickLangText(product?.title);

  if (title) {
    return title;
  }

  const family =
    getFrenchSeoFamilyName(product);

  const productId =
    product?.productId ||
    product?.id ||
    "";

  return productId
    ? `${family} ${productId} | Wahret Zmen`
    : `${family} | Wahret Zmen`;
};

const getProductDescription = (product = {}) => {
  const translated =
    pickLangText(
      product?.translations?.description
    );

  const description =
    translated ||
    pickLangText(product?.description);

  if (description) {
    return description;
  }

  return `${getFrenchSeoFamilyName(
    product
  )} proposée par Wahret Zmen by Sabri, marque tunisienne spécialisée dans la jebba, la keswa et les vêtements traditionnels tunisiens.`;
};

/* ============================================================================
   PRODUCT IMAGE HELPERS
============================================================================ */

const collectProductImages = (
  product,
  baseUrl
) => {
  const images = [];

  const pushImage = (value) => {
    const url = absoluteUrl(
      baseUrl,
      value
    );

    if (url) {
      images.push(url);
    }
  };

  pushImage(product?.coverImage);
  pushImage(product?.image);
  pushImage(product?.thumbnail);

  if (Array.isArray(product?.images)) {
    product.images.forEach(pushImage);
  }

  if (Array.isArray(product?.colors)) {
    product.colors.forEach((color) => {
      if (
        Array.isArray(color?.images)
      ) {
        color.images.forEach(
          pushImage
        );
      }
    });
  }

  return unique(images);
};

/* ============================================================================
   BLOG HELPERS
============================================================================ */

const getBlogPostUrl = (
  baseUrl,
  post
) =>
  `${baseUrl}/blog/${encodeURIComponent(
    String(post?.slug || "").trim()
  )}`;

const getBlogLastmod = (post) =>
  toIsoDate(
    post?.updatedAt ||
      post?.publishedAt ||
      post?.createdAt
  );

const getBlogPriority = (post = {}) => {
  if (post?.featured) {
    return "0.90";
  }

  return "0.80";
};

/* ============================================================================
   DATABASE QUERIES
============================================================================ */

const getIndexableProducts = async () => {
  try {
    const query = Product.find({});

    if (
      query &&
      typeof query.sort === "function"
    ) {
      query.sort({
        trending: -1,
        updatedAt: -1,
        createdAt: -1,
      });
    }

    if (
      query &&
      typeof query.lean === "function"
    ) {
      query.lean();
    }

    const products = await query;

    return Array.isArray(products)
      ? products
      : [];
  } catch (error) {
    console.error(
      "❌ SEO products query error:",
      error
    );

    return [];
  }
};

const getPublishedBlogPosts = async () => {
  try {
    const filters = [
      {},
      { status: "published" },
      { published: true },
    ];

    let posts = [];

    for (const filter of filters) {
      try {
        const query =
          BlogPost.find(filter);

        if (
          query &&
          typeof query.sort === "function"
        ) {
          query.sort({
            publishedAt: -1,
            updatedAt: -1,
            createdAt: -1,
          });
        }

        if (
          query &&
          typeof query.lean === "function"
        ) {
          query.lean();
        }

        const result = await query;

        if (
          Array.isArray(result) &&
          result.length
        ) {
          posts = result;
          break;
        }
      } catch {
        // Try the next compatible
        // blog model query shape.
      }
    }

    return Array.isArray(posts)
      ? posts.filter(
          (post) =>
            Boolean(post?.slug)
        )
      : [];
  } catch (error) {
    console.error(
      "❌ SEO blog query error:",
      error
    );

    return [];
  }
};

/* ============================================================================
   XML RESPONSE
============================================================================ */

const buildXmlResponse = (
  res,
  xml
) => {
  res.set(
    "Content-Type",
    "application/xml; charset=utf-8"
  );

  res.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
  );

  res.status(200).send(xml);
};

/* =============================================================================
   VIDEO HELPERS
============================================================================= */

const isoDurationToSeconds = (
  duration = ""
) => {
  const match =
    String(duration).match(
      /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i
    );

  if (!match) return 0;

  const hours =
    Number(match[1] || 0);

  const minutes =
    Number(match[2] || 0);

  const seconds =
    Number(match[3] || 0);

  return (
    hours * 3600 +
    minutes * 60 +
    seconds
  );
};

const getStaticVideos = (
  baseUrl
) =>
  VIDEO_PAGES.map((item) => ({
    ...item,

    pageUrl: absoluteUrl(
      baseUrl,
      item.pagePath
    ),

    contentUrl: absoluteUrl(
      baseUrl,
      item.videoPath
    ),

    thumbnailUrl: absoluteUrl(
      baseUrl,
      item.thumbnailPath
    ),

    publicationDate:
      toIsoDateTime(
        item.uploadDate
      ),

    durationSeconds:
      isoDurationToSeconds(
        item.duration
      ),

    category:
      "Mode traditionnelle tunisienne",

    tags: [
      "Wahret Zmen",
      "Jebba tunisienne",
      "Keswa tunisienne",
      "vêtement traditionnel tunisien",
      "broderie artisanale tunisienne",
      "patrimoine tunisien",
    ],

    uploader:
      "Wahret Zmen by Sabri",

    familyFriendly: "yes",

    requiresSubscription: "no",

    live: "no",

    lastmod: toIsoDate(
      VIDEO_METADATA_LAST_MODIFIED ||
        item.uploadDate
    ),

    priority:
      item.priority || "0.85",

    changefreq:
      item.changefreq || "weekly",
  })).filter(
    (item) =>
      item.pageUrl &&
      item.contentUrl &&
      item.thumbnailUrl &&
      item.title &&
      item.description &&
      item.durationSeconds > 0
  );

/* ============================================================================
   SITEMAP INDEX
============================================================================ */

const getSitemapIndex = async (
  req,
  res
) => {
  try {
    const baseUrl =
      getCanonicalBaseUrl();

    const today =
      toIsoDate();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${escapeXml(
      `${baseUrl}/sitemaps/pages.xml`
    )}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>

  <sitemap>
    <loc>${escapeXml(
      `${baseUrl}/sitemaps/products.xml`
    )}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>

  <sitemap>
    <loc>${escapeXml(
      `${baseUrl}/sitemaps/blog.xml`
    )}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>

  <sitemap>
    <loc>${escapeXml(
      `${baseUrl}/sitemaps/images.xml`
    )}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>

  <sitemap>
    <loc>${escapeXml(
      `${baseUrl}/sitemaps/videos.xml`
    )}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;

    buildXmlResponse(
      res,
      xml
    );
  } catch (error) {
    console.error(
      "❌ Sitemap index error:",
      error
    );

    res
      .status(500)
      .send(
        "Error generating sitemap index"
      );
  }
};

/* ============================================================================
   STATIC PAGES SITEMAP
============================================================================ */

const getPagesSitemap = async (
  req,
  res
) => {
  try {
    const baseUrl =
      getCanonicalBaseUrl();

    const today =
      toIsoDate();

    const videos =
      getStaticVideos(baseUrl);

    const staticPageXml =
      STATIC_PAGES.map(
        (page) => `  <url>
    <loc>${escapeXml(
      `${baseUrl}${page.path}`
    )}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
      ).join("\n");

    const videoPageXml =
      videos
        .map(
          (video) => `  <url>
    <loc>${escapeXml(
      video.pageUrl
    )}</loc>
    <lastmod>${video.lastmod}</lastmod>
    <changefreq>${video.changefreq}</changefreq>
    <priority>${video.priority}</priority>
  </url>`
        )
        .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPageXml}
${videoPageXml}
</urlset>`;

    buildXmlResponse(
      res,
      xml
    );
  } catch (error) {
    console.error(
      "❌ Pages sitemap error:",
      error
    );

    res
      .status(500)
      .send(
        "Error generating pages sitemap"
      );
  }
};

/* ============================================================================
   PRODUCTS SITEMAP
============================================================================ */

const getProductsSitemap = async (
  req,
  res
) => {
  try {
    const baseUrl =
      getCanonicalBaseUrl();

    const products =
      await getIndexableProducts();

    const urls = products
      .map((product) => {
        const routeSegment =
          getProductRouteSegment(
            product
          );

        if (!routeSegment) {
          return "";
        }

        return `  <url>
    <loc>${escapeXml(
      getProductUrl(
        baseUrl,
        product
      )
    )}</loc>
    <lastmod>${getProductLastmod(
      product
    )}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${getProductPriority(
      product
    )}</priority>
  </url>`;
      })
      .filter(Boolean)
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    buildXmlResponse(
      res,
      xml
    );
  } catch (error) {
    console.error(
      "❌ Products sitemap error:",
      error
    );

    res
      .status(500)
      .send(
        "Error generating products sitemap"
      );
  }
};

/* ============================================================================
   BLOG SITEMAP
============================================================================ */

const getBlogSitemap = async (
  req,
  res
) => {
  try {
    const baseUrl =
      getCanonicalBaseUrl();

    const posts =
      await getPublishedBlogPosts();

    const urls = posts
      .map((post) => {
        if (!post.slug) {
          return "";
        }

        return `  <url>
    <loc>${escapeXml(
      getBlogPostUrl(
        baseUrl,
        post
      )
    )}</loc>
    <lastmod>${getBlogLastmod(
      post
    )}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${getBlogPriority(
      post
    )}</priority>
  </url>`;
      })
      .filter(Boolean)
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    buildXmlResponse(
      res,
      xml
    );
  } catch (error) {
    console.error(
      "❌ Blog sitemap error:",
      error
    );

    res
      .status(500)
      .send(
        "Error generating blog sitemap"
      );
  }
};

/* ============================================================================
   GOOGLE IMAGE SITEMAP

   Includes:
   - product images
   - blog cover images
   - stable About gallery images when ABOUT_GALLERY_IMAGE_URLS is configured

   Current image sitemap markup deliberately uses <image:loc>.
   The semantic description of About gallery images belongs primarily on
   /about through:
   - descriptive filename
   - alt
   - title
   - surrounding content
   - ImageObject
   - ImageGallery
   - primaryImageOfPage
============================================================================ */

const getImagesSitemap = async (
  req,
  res
) => {
  try {
    const baseUrl =
      getCanonicalBaseUrl();

    const products =
      await getIndexableProducts();

    const blogPosts =
      await getPublishedBlogPosts();

    /* ------------------------------------------------------------------------
       PRODUCT IMAGES
    ------------------------------------------------------------------------ */

    const productImageUrls =
      products
        .map((product) => {
          const routeSegment =
            getProductRouteSegment(
              product
            );

          if (!routeSegment) {
            return "";
          }

          const productUrl =
            getProductUrl(
              baseUrl,
              product
            );

          const images =
            collectProductImages(
              product,
              baseUrl
            );

          if (!images.length) {
            return "";
          }

          return `  <url>
    <loc>${escapeXml(
      productUrl
    )}</loc>
    <lastmod>${getProductLastmod(
      product
    )}</lastmod>
${images
  .map(
    (img) => `    <image:image>
      <image:loc>${escapeXml(
        img
      )}</image:loc>
    </image:image>`
  )
  .join("\n")}
  </url>`;
        })
        .filter(Boolean)
        .join("\n");

    /* ------------------------------------------------------------------------
       BLOG IMAGES
    ------------------------------------------------------------------------ */

    const blogImageUrls =
      blogPosts
        .map((post) => {
          if (
            !post.slug ||
            !post.coverImage
          ) {
            return "";
          }

          const pageUrl =
            getBlogPostUrl(
              baseUrl,
              post
            );

          const imageUrl =
            absoluteUrl(
              baseUrl,
              post.coverImage
            );

          if (!imageUrl) {
            return "";
          }

          return `  <url>
    <loc>${escapeXml(
      pageUrl
    )}</loc>
    <lastmod>${getBlogLastmod(
      post
    )}</lastmod>
    <image:image>
      <image:loc>${escapeXml(
        imageUrl
      )}</image:loc>
    </image:image>
  </url>`;
        })
        .filter(Boolean)
        .join("\n");

    /* ------------------------------------------------------------------------
       ABOUT PAGE GALLERY IMAGES

       We only include URLs that are explicitly known to be stable production
       URLs. We never invent Vite build hashes.

       Example .env:

       ABOUT_GALLERY_IMAGE_URLS=
       https://www.wahretzmen.com/images/about/wahret-zmen-jebba-femme-bleu-ciel-broderie-doree.avif,
       https://www.wahretzmen.com/images/about/wahret-zmen-jebba-femme-noire-broderie-traditionnelle.avif
    ------------------------------------------------------------------------ */

    const aboutGalleryXml =
      ABOUT_GALLERY_IMAGE_URLS.length
        ? `  <url>
    <loc>${escapeXml(
      `${baseUrl}/about`
    )}</loc>
    <lastmod>${toIsoDate(
      ABOUT_GALLERY_LASTMOD
    )}</lastmod>
${unique(
  ABOUT_GALLERY_IMAGE_URLS
)
  .map(
    (img) => `    <image:image>
      <image:loc>${escapeXml(
        img
      )}</image:loc>
    </image:image>`
  )
  .join("\n")}
  </url>`
        : "";

    /* ------------------------------------------------------------------------
       FINAL IMAGE SITEMAP
    ------------------------------------------------------------------------ */

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
>
${productImageUrls}
${blogImageUrls}
${aboutGalleryXml}
</urlset>`;

    buildXmlResponse(
      res,
      xml
    );
  } catch (error) {
    console.error(
      "❌ Images sitemap error:",
      error
    );

    res
      .status(500)
      .send(
        "Error generating images sitemap"
      );
  }
};

/* ============================================================================
   GOOGLE VIDEO SITEMAP
============================================================================ */

const getVideosSitemap = async (
  req,
  res
) => {
  try {
    const baseUrl =
      getCanonicalBaseUrl();

    const videos =
      getStaticVideos(baseUrl);

    const urls = videos
      .map(
        (video) => `  <url>
    <loc>${escapeXml(
      video.pageUrl
    )}</loc>

    <lastmod>${video.lastmod}</lastmod>

    <video:video>
      <video:thumbnail_loc>${escapeXml(
        video.thumbnailUrl
      )}</video:thumbnail_loc>

      <video:title>${escapeXml(
        video.title
      )}</video:title>

      <video:description>${escapeXml(
        video.description
      )}</video:description>

      <video:content_loc>${escapeXml(
        video.contentUrl
      )}</video:content_loc>

      <video:publication_date>${escapeXml(
        video.publicationDate
      )}</video:publication_date>

      <video:duration>${escapeXml(
        video.durationSeconds
      )}</video:duration>

      <video:category>${escapeXml(
        video.category
      )}</video:category>

${video.tags
  .slice(0, 32)
  .map(
    (tag) =>
      `      <video:tag>${escapeXml(
        tag
      )}</video:tag>`
  )
  .join("\n")}

      <video:uploader info="${escapeXml(
        `${baseUrl}/about`
      )}">${escapeXml(
        video.uploader
      )}</video:uploader>

      <video:requires_subscription>${escapeXml(
        video.requiresSubscription
      )}</video:requires_subscription>

      <video:family_friendly>${escapeXml(
        video.familyFriendly
      )}</video:family_friendly>

      <video:live>${escapeXml(
        video.live
      )}</video:live>
    </video:video>
  </url>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
>
${urls}
</urlset>`;

    buildXmlResponse(
      res,
      xml
    );
  } catch (error) {
    console.error(
      "❌ Videos sitemap error:",
      error
    );

    res
      .status(500)
      .send(
        "Error generating videos sitemap"
      );
  }
};

/* ============================================================================
   MAIN SITEMAP
============================================================================ */

const getSitemap =
  getSitemapIndex;

/* ============================================================================
   ROBOTS.TXT

   Explicitly allows:
   - About page
   - Vite /assets/
   - stable /images/
   - uploads
   - video thumbnails
   - SEO sitemaps

   Googlebot can therefore crawl the resources needed for Google Search and
   Google Images.
============================================================================ */

const getRobotsTxt = (
  req,
  res
) => {
  const baseUrl =
    getCanonicalBaseUrl();

  res.set(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  res.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
  );

  res.send(`User-agent: *
Allow: /
Allow: /products
Allow: /products/
Allow: /products?
Allow: /blog
Allow: /blog/
Allow: /about
Allow: /contact
Allow: /videos
Allow: /videos/
Allow: /videos/posters/
Allow: /uploads/
Allow: /assets/
Allow: /images/
Allow: /sitemaps/
Allow: /sitemap.xml
Allow: /sitemap-index.xml

Disallow: /admin
Disallow: /admin/
Disallow: /dashboard
Disallow: /dashboard/
Disallow: /cart
Disallow: /checkout
Disallow: /order-success
Disallow: /order-confirm
Disallow: /order-track
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/sitemap-index.xml
Sitemap: ${baseUrl}/sitemaps/pages.xml
Sitemap: ${baseUrl}/sitemaps/products.xml
Sitemap: ${baseUrl}/sitemaps/blog.xml
Sitemap: ${baseUrl}/sitemaps/images.xml
Sitemap: ${baseUrl}/sitemaps/videos.xml`);
};

/* ============================================================================
   EXPORTS
============================================================================ */

module.exports = {
  getSitemap,
  getSitemapIndex,
  getPagesSitemap,
  getProductsSitemap,
  getBlogSitemap,
  getImagesSitemap,
  getVideosSitemap,
  getRobotsTxt,
};