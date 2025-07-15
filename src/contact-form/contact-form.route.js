const express = require("express");
const { sendContactEmail } = require("../contact-form/contact-form.controller.js");

const router = express.Router();

// Contact form route
router.post("/", sendContactEmail);

module.exports = router;





