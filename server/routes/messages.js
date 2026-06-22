const router = require("express").Router();
const Message = require("../models/message");
const { encrypt, decrypt } = require("../utils/crypto");

// Helper: convert a Mongoose message doc into a client-facing plain object with decrypted text
function toClientMessage(doc) {
  return {
    _id: doc._id,
    senderId: doc.senderId,
    receiverId: doc.receiverId,
    text: decrypt({
      encryptedText: doc.encryptedText,
      iv: doc.iv,
      authTag: doc.authTag
    }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

// Get conversation — decrypt each message before sending
router.get("/:senderId/:receiverId", async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;
    const messages = await Message.find({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ],
      deletedFor: { $ne: senderId }
    }).sort({ createdAt: 1 });

    res.json(messages.map(toClientMessage)); // ← decrypt before responding
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save a new message — encrypt before storing
router.post("/", async (req, res) => {
  try {
    const { senderId, receiverId, text } = req.body;

    if (!text || !text.trim())
      return res.status(400).json({ error: "Message text is required" });

    const { encryptedText, iv, authTag } = encrypt(text);

    const message = await Message.create({
      senderId, receiverId, encryptedText, iv, authTag
    });

    res.status(201).json(toClientMessage(message)); // ← respond with decrypted text
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:messageId/everyone", async (req, res) => {
  try {
    const { userId } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (message.senderId.toString() !== userId)
      return res.status(403).json({ error: "You can only delete your own messages for everyone" });

    await Message.findByIdAndDelete(req.params.messageId);
    res.json({ message: "Message deleted for everyone", messageId: req.params.messageId });
  } catch (err) {
    console.error("DELETE /everyone error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:messageId/me", async (req, res) => {
  try {
    const { userId } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    const isParticipant =
      message.senderId.toString() === userId ||
      message.receiverId.toString() === userId;

    if (!isParticipant)
      return res.status(403).json({ error: "You are not part of this conversation" });

    if (!message.deletedFor.includes(userId)) {
      message.deletedFor.push(userId);
      await message.save();
    }

    res.json({ message: "Message deleted for you", messageId: message._id });
  } catch (err) {
    console.error("DELETE /me error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/clear/:userId/:otherUserId", async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;
    await Message.deleteMany({
      $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId }
      ]
    });
    res.json({ message: "Chat cleared" });
  } catch (err) {
    console.error("Clear chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;