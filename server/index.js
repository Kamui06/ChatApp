
require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Frontend origins allowed to connect
const allowedOrigins = (
  process.env.CLIENT_URLS ||
  "http://localhost:3000,https://chatapp-coral-chi.vercel.app"
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE"]
}));

app.use(express.json());

// Socket.IO server
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

// API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/contacts", require("./routes/contacts"));
app.use("/api/requests", require("./routes/requests"));

// userId -> Set of socket IDs
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Register a user's socket
  socket.on("user-online", (userId) => {
    if (!userId) return;

    const id = String(userId);

    socket.data.userId = id;
    socket.join(`user:${id}`);

    if (!onlineUsers.has(id)) {
      onlineUsers.set(id, new Set());
    }

    onlineUsers.get(id).add(socket.id);

    io.emit("online-users", Array.from(onlineUsers.keys()));
  });

  // Send a message to every active socket of the receiver
  socket.on("send-message", (message) => {
    if (!message?.receiverId) return;

    io.to(`user:${message.receiverId}`)
      .emit("receive-message", message);
  });

  // Typing indicator
  socket.on("typing", ({ senderId, receiverId } = {}) => {
    if (!receiverId) return;

    io.to(`user:${receiverId}`)
      .emit("typing", senderId);
  });

  socket.on("stop-typing", ({ senderId, receiverId } = {}) => {
    if (!receiverId) return;

    io.to(`user:${receiverId}`)
      .emit("stop-typing", senderId);
  });

  // Delete message for everyone
  socket.on(
    "delete-message-everyone",
    ({ messageId, receiverId } = {}) => {
      if (!receiverId) return;

      io.to(`user:${receiverId}`)
        .emit("message-deleted-everyone", messageId);
    }
  );

  // Clear conversation
  socket.on("clear-chat", ({ receiverId } = {}) => {
    if (!receiverId) return;

    io.to(`user:${receiverId}`)
      .emit("chat-cleared");
  });

  // New contact request
  socket.on("send-request", ({ receiverId } = {}) => {
    if (!receiverId) return;

    io.to(`user:${receiverId}`)
      .emit("new-request");
  });

  // Remove contact
  socket.on(
    "remove-contact",
    ({ removedUserId, byUserId } = {}) => {
      if (!removedUserId) return;

      io.to(`user:${removedUserId}`)
        .emit("contact-removed", byUserId);
    }
  );

  // Handle disconnect
  socket.on("disconnect", () => {
    const userId = socket.data.userId;

    if (userId && onlineUsers.has(userId)) {
      const userSockets = onlineUsers.get(userId);

      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }

    io.emit("online-users", Array.from(onlineUsers.keys()));

    console.log("Socket disconnected:", socket.id);
  });
});

// Start server after MongoDB connects
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    const PORT = process.env.PORT || 5000;

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB connection error:", err);
  });
