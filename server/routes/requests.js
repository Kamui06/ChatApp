const router = require("express").Router();
const Request = require("../models/request");
const Contact = require("../models/contact");
const User    = require("../models/user");

// Send a request
router.post("/send", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    if (senderId === receiverId)
      return res.status(400).json({ error: "You can't send a request to yourself" });

    const alreadyContact = await Contact.findOne({ userId: senderId, contactId: receiverId });
    if (alreadyContact)
      return res.status(400).json({ error: "Already in your contacts" });

    const existing = await Request.findOne({ senderId, receiverId, status: "pending" });
    if (existing)
      return res.status(400).json({ error: "Request already sent" });

    const reverse = await Request.findOne({ senderId: receiverId, receiverId: senderId, status: "pending" });
    if (reverse)
      return res.status(400).json({ error: "This user already sent you a request — check your inbox" });

    const request = await Request.create({ senderId, receiverId });
    const populated = await request.populate("senderId", "username _id");
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all pending incoming requests for a user
router.get("/inbox/:userId", async (req, res) => {
  try {
    const requests = await Request.find({
      receiverId: req.params.userId,
      status: "pending"
    }).populate("senderId", "username _id").sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending outgoing requests for a user
router.get("/sent/:userId", async (req, res) => {
  try {
    const requests = await Request.find({
      senderId: req.params.userId,
      status: "pending"
    }).populate("receiverId", "username _id").sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending request count for a user
router.get("/count/:userId", async (req, res) => {
  try {
    const count = await Request.countDocuments({
      receiverId: req.params.userId,
      status: "pending"
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept a request
router.post("/accept/:requestId", async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });

    request.status = "accepted";
    await request.save();

    // Add both users as contacts of each other
    await Contact.create([
      { userId: request.senderId,   contactId: request.receiverId },
      { userId: request.receiverId, contactId: request.senderId   }
    ]);

    const sender = await User.findById(request.senderId, "username _id");
    res.json({ message: "Request accepted", contact: sender });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decline a request
router.post("/decline/:requestId", async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });

    request.status = "declined";
    await request.save();
    res.json({ message: "Request declined" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel a sent request
router.delete("/cancel/:requestId", async (req, res) => {
  try {
    await Request.findByIdAndDelete(req.params.requestId);
    res.json({ message: "Request cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;