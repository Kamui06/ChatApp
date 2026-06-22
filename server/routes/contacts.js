const router = require("express").Router();
const Contact = require("../models/contact");
const User = require("../models/user");
const Request = require("../models/request"); // add this import at the top

router.delete("/remove", async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    await Contact.deleteMany({
      $or: [
        { userId: userId,    contactId: contactId },
        { userId: contactId, contactId: userId    }
      ]
    });

    // ← new: clean up old request history between these two users
    await Request.deleteMany({
      $or: [
        { senderId: userId,    receiverId: contactId },
        { senderId: contactId, receiverId: userId    }
      ]
    });

    res.json({ message: "Contact removed for both users" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all contacts for a user
router.get("/:userId", async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.params.userId })
      .populate("contactId", "username _id");
    res.json(contacts.map(c => c.contactId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a contact
router.post("/add", async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    if (userId === contactId)
      return res.status(400).json({ error: "You can't add yourself" });

    const existing = await Contact.findOne({ userId, contactId });
    if (existing)
      return res.status(400).json({ error: "Already in your contacts" });

    await Contact.create({ userId, contactId });

    const user = await User.findById(contactId, "username _id");
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a contact — removes BOTH directions of the relationship
router.delete("/remove", async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    await Contact.deleteMany({
      $or: [
        { userId: userId,    contactId: contactId },
        { userId: contactId, contactId: userId    }
      ]
    });

    res.json({ message: "Contact removed for both users" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search users — exclude self, existing contacts, and pending requests
router.get("/search/:userId/:query", async (req, res) => {
  try {
    const { userId, query } = req.params;

    const contacts = await Contact.find({ userId }).select("contactId");
    const contactIds = contacts.map(c => c.contactId.toString());

    // Also exclude users with pending requests in either direction
    const sentRequests = await require("../models/request").find({
      $or: [
        { senderId: userId, status: "pending" },
        { receiverId: userId, status: "pending" }
      ]
    });
    const requestUserIds = sentRequests.map(r =>
      r.senderId.toString() === userId ? r.receiverId.toString() : r.senderId.toString()
    );

    const excludeIds = [...new Set([...contactIds, ...requestUserIds])];

    const users = await User.find({
      username: { $regex: query, $options: "i" },
      _id: { $ne: userId, $nin: excludeIds }
    }, "username _id").limit(8);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;