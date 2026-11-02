
require("dotenv").config();

const express = require("express");
const http = require("node:http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Allowed frontend origins

const allowedOrigins = (
  process.env.CLIENT_URLS ||
  "http://localhost:3000,https://chatapp-coral-chi.vercel.app"
)
  .split(",")
  .map(origin => {
    const trimmedOrigin = origin.trim();
    let end = trimmedOrigin.length;
    while (end > 0 && trimmedOrigin.codePointAt(end - 1) === 47) end--;
    return trimmedOrigin.slice(0, end);
  })
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    let originEnd = origin.length;
    while (originEnd > 0 && origin.codePointAt(originEnd - 1) === 47) originEnd--;
    const normalizedOrigin = origin.slice(0, originEnd);

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.error("CORS blocked origin:", origin);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
};


app.use(cors(corsOptions));
app.use(express.json());

// Socket.IO server
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 20000,
  connectTimeout: 20000
});

// API routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/contacts", require("./routes/contacts"));
app.use("/api/requests", require("./routes/requests"));

// userId -> Set of socket IDs
const onlineUsers = new Map();

function emitOnlineUsers() {
  io.emit("online-users", Array.from(onlineUsers.keys()));
}

// Socket connections
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Register user after connection
  socket.on("user-online", (userId) => {
    if (!userId) return;

    const id = String(userId);

    // Avoid duplicate registration for the same socket
    if (socket.data.userId === id) {
      emitOnlineUsers();
      return;
    }

    // Remove previous registration if this socket changes user
    if (socket.data.userId) {
      const previousId = socket.data.userId;
      const previousSockets = onlineUsers.get(previousId);

      if (previousSockets) {
        previousSockets.delete(socket.id);

        if (previousSockets.size === 0) {
          onlineUsers.delete(previousId);
        }
      }

      void socket.leave(`user:${previousId}`);
    }

    socket.data.userId = id;
    void socket.join(`user:${id}`);

    if (!onlineUsers.has(id)) {
      onlineUsers.set(id, new Set());
    }

    onlineUsers.get(id).add(socket.id);

    console.log(`User ${id} is online`);

    emitOnlineUsers();
  });

  // Send messages to all active sockets of receiver
  socket.on("send-message", (message) => {
    if (!message?.receiverId) return;

    const receiverId = String(message.receiverId);

    io.to(`user:${receiverId}`).emit(
      "receive-message",
      message
    );
  });

  // Typing indicator
  socket.on("typing", (data = {}) => {
    const { senderId, receiverId } = data;

    if (!receiverId) return;

    io.to(`user:${String(receiverId)}`).emit(
      "typing",
      senderId
    );
  });

  socket.on("stop-typing", (data = {}) => {
    const { senderId, receiverId } = data;

    if (!receiverId) return;

    io.to(`user:${String(receiverId)}`).emit(
      "stop-typing",
      senderId
    );
  });

  // Delete message for everyone
  socket.on("delete-message-everyone", (data = {}) => {
    const { messageId, receiverId } = data;

    if (!receiverId || !messageId) return;

    io.to(`user:${String(receiverId)}`).emit(
      "message-deleted-everyone",
      messageId
    );
  });

  // Clear conversation
  socket.on("clear-chat", (data = {}) => {
    const { receiverId } = data;

    if (!receiverId) return;

    io.to(`user:${String(receiverId)}`).emit(
      "chat-cleared"
    );
  });

  // New contact request
  socket.on("send-request", (data = {}) => {
    const { receiverId } = data;

    if (!receiverId) return;

    io.to(`user:${String(receiverId)}`).emit(
      "new-request"
    );
  });

  // Remove contact
  socket.on("remove-contact", (data = {}) => {
    const { removedUserId, byUserId } = data;

    if (!removedUserId) return;

    io.to(`user:${String(removedUserId)}`).emit(
      "contact-removed",
      byUserId
    );
  });

  // Disconnect handling
  socket.on("disconnect", (reason) => {
    const userId = socket.data.userId;

    if (userId && onlineUsers.has(userId)) {
      const userSockets = onlineUsers.get(userId);

      userSockets.delete(socket.id);

      // Only mark offline when every socket for this user is gone
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
        console.log(`User ${userId} is offline`);
      }
    }

    emitOnlineUsers();

    console.log(
      "Socket disconnected:",
      socket.id,
      "Reason:",
      reason
    );
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error.message);
  });
});

// Basic health check
app.get("/", (req, res) => {
  res.status(200).send("Chat server is running");
});

// Start server after MongoDB connects
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    const PORT = process.env.PORT || 5000;

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log("Allowed frontend origins:", allowedOrigins);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Closing server...");

  void io.close(() => {
    server.close(async () => {
      try {
        await mongoose.connection.close(false);
        process.exit(0);
      } catch (error) {
        console.error("MongoDB shutdown error:", error);
        process.exit(1);
      }
    });
  });
});
