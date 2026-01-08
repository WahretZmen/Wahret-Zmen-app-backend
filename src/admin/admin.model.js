// src/admin/adminmodel.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// Admin account (Arabic-only)
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
    password: {
      type: String,
      required: [true, "كلمة المرور مطلوبة"],
      minlength: [6, "كلمة المرور قصيرة جدًا"],
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

// Hash password
adminSchema.pre("save", async function (next) {
  try {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password
adminSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports =
  mongoose.models.Admin || mongoose.model("Admin", adminSchema);
