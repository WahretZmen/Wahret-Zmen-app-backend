// src/routes/contact-form.route.js
const express = require("express");
const { sendContactEmail } = require("../contact-form/contact-form.controller.js");

const router = express.Router();

/**
 * 📩 Contact Form Routes
 * --------------------------------------------------
 * POST /
 * - Handles contact form submissions
 * - Uses sendContactEmail controller
 */
router.post("/", sendContactEmail);

module.exports = router;



