const express = require("express");

const {
  getSitemap,
  getSitemapIndex,
  getPagesSitemap,
  getProductsSitemap,
  getBlogSitemap,
  getImagesSitemap,
  getVideosSitemap,
  getRobotsTxt,
} = require("./seo.controller");

const router = express.Router();

router.get("/sitemap.xml", getSitemap);
router.get("/sitemap-index.xml", getSitemapIndex);

router.get("/sitemaps/pages.xml", getPagesSitemap);
router.get("/sitemaps/products.xml", getProductsSitemap);
router.get("/sitemaps/blog.xml", getBlogSitemap);
router.get("/sitemaps/images.xml", getImagesSitemap);
router.get("/sitemaps/videos.xml", getVideosSitemap);

router.get("/robots.txt", getRobotsTxt);

module.exports = router;