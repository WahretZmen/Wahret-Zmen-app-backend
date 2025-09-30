const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email:    { type: String, required: true },
  password: { type: String, required: true }, // plain text
  role:     { type: String, default: "admin" },
});

// ⬇️ 3rd argument = force collection = "users"
module.exports = mongoose.model("Admin", AdminSchema, "users");
