// src/contact-form/contact-form.controller.js
const nodemailer = require("nodemailer");
require("dotenv").config();

/* =============================================================================
   📧 NODEMAILER TRANSPORTER
   - Uses Gmail service with credentials from .env
   - EMAIL_USER: sender/receiver address
   - EMAIL_PASS: app password (NOT your Gmail login password)
============================================================================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* =============================================================================
   📩 SEND CONTACT EMAIL
   - Validates request body (name, email, subject, message)
   - Sends email to your configured EMAIL_USER
============================================================================= */
const sendContactEmail = async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Basic validation
  if (!name || !email || !subject || !message) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });
  }

  try {
    // Send email via transporter
    await transporter.sendMail({
      from: `${name} <${email}>`,
      to: process.env.EMAIL_USER, // Your inbox
      subject: `New Contact from ${name}: ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage: ${message}`,
    });

    res
      .status(200)
      .json({ success: true, message: "Message sent successfully!" });
  } catch (error) {
    console.error("❌ Email sending error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to send message" });
  }
};

module.exports = { sendContactEmail };
