const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  encryptedText: { type: String, required: true }, // ← ciphertext, replaces 'text'
  iv:            { type: String, required: true },
  authTag:       { type: String, required: true },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);