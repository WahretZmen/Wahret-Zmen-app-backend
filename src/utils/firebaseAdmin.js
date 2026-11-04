// src/utils/firebaseAdmin.js
const admin = require("firebase-admin");

let firebaseKey;

// ✅ Parse Firebase key safely
try {
  if (!process.env.FIREBASE_ADMIN_KEY) {
    console.warn("⚠️ Firebase Admin key missing in environment variables.");
  } else {
    firebaseKey = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

    if (firebaseKey.private_key) {
      firebaseKey.private_key = firebaseKey.private_key.replace(/\\n/g, "\n");
    }
  }
} catch (err) {
  console.error("❌ Failed to parse FIREBASE_ADMIN_KEY:", err.message);
}

// ✅ Initialize Firebase Admin SDK (only once)
if (firebaseKey && !admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseKey),
    });
    console.log("🔥 Firebase Admin initialized successfully");
  } catch (err) {
    console.error("❌ Firebase Admin initialization error:", err.message);
  }
}

module.exports = admin;
