// src/admin/admin.model.js
const mongoose = require("mongoose");

// Admin account (plain-text password as you requested)
const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "اسم المستخدم مطلوب"],
      trim: true,
      minlength: [3, "اسم المستخدم قصير جدًا"],
      maxlength: [50, "اسم المستخدم طويل جدًا"],
      unique: true,
    },
    email: {
      type: String,
      required: [true, "البريد الإلكتروني مطلوب"],
      trim: true,
      lowercase: true,
      unique: true,
    },
    // ✅ plain text password (NOT hashed)
    password: {
      type: String,
      required: [true, "كلمة المرور مطلوبة"],
      minlength: [3, "كلمة المرور قصيرة جدًا"],
      select: false,
    },
    role: {
      type: String,
      enum: ["admin"],
      default: "admin",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ Plain compare helper (no bcrypt)
adminSchema.methods.comparePassword = function (candidatePassword) {
  const a = typeof this.password === "string" ? this.password.trim() : String(this.password ?? "").trim();
  const b = typeof candidatePassword === "string" ? candidatePassword.trim() : String(candidatePassword ?? "").trim();
  return a === b;
};

module.exports = mongoose.models.Admin || mongoose.model("Admin", adminSchema);