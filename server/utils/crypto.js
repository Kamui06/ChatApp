const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(process.env.MESSAGE_ENCRYPTION_KEY, "hex"); // 32 bytes

if (KEY.length !== 32) {
  throw new Error("MESSAGE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
}

// Encrypts plaintext, returns { encryptedText, iv, authTag } — all stored in DB
function encrypt(plainText) {
  const iv = crypto.randomBytes(12); // GCM recommended IV size
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encryptedText: encrypted,
    iv: iv.toString("hex"),
    authTag
  };
}

// Decrypts using the stored iv + authTag, returns the original plaintext
function decrypt({ encryptedText, iv, authTag }) {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, "hex"));
    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("Decryption failed:", err.message);
    return "[Unable to decrypt message]"; // graceful fallback, never crash the request
  }
}

module.exports = { encrypt, decrypt };