require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "https://chatapp-coral-chi.vercel.app" // ← add this after deploying to Vercel
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/contacts", require("./routes/contacts"));
app.use("/api/requests", require("./routes/requests"));

// Socket.io — track online users
const onlineUsers = new Map(); // userId -> socketId

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("user-online", (userId) => {
    onlineUsers.set(userId, socket.id);
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });

  socket.on("send-message", (message) => {
    const receiverSocketId = onlineUsers.get(message.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receive-message", message);
    }
  });

  socket.on("typing", ({ senderId, receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", senderId);
    }
  });

  socket.on("stop-typing", ({ senderId, receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("stop-typing", senderId);
    }
  });

  socket.on("delete-message-everyone", ({ messageId, receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("message-deleted-everyone", messageId);
    }
  });

  socket.on("clear-chat", ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("chat-cleared");
    }
  });

  socket.on("send-request", ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("new-request");
    }
  });

  socket.on("remove-contact", ({ removedUserId, byUserId }) => {
    const targetSocketId = onlineUsers.get(removedUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("contact-removed", byUserId);
    }
  });

  socket.on("disconnect", () => {
    for (let [userId, socketId] of onlineUsers) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit("online-users", Array.from(onlineUsers.keys()));
    console.log("Socket disconnected:", socket.id);
  });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("DB connection error:", err));