// src/utils/firebaseAdmin.js

const admin = require('firebase-admin');

// Get the key from the environment variable
const firebaseKey = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

// Fix the private_key: replace \\n with actual newlines
firebaseKey.private_key = firebaseKey.private_key.replace(/\\n/g, '\n');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseKey),
  });
}

module.exports = admin;
