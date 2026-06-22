const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status:     { type: String, enum: ["pending", "accepted", "declined"], default: "pending" }
}, { timestamps: true });

// Remove the old strict unique index
// requestSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });

// No DB-level unique index — uniqueness for pending requests is enforced in the route logic instead

module.exports = mongoose.model("Request", requestSchema);