
import { io } from "socket.io-client";

const SERVER_URL = (
  process.env.REACT_APP_SERVER_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

export const socket = io(SERVER_URL, {
  autoConnect: false,

  // Automatically reconnect after temporary network failures
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,

  // Connection and heartbeat settings
  timeout: 20000,

  // Prefer WebSocket, fall back to polling
  transports: ["websocket", "polling"],
  tryAllTransports: true
});

// Connection diagnostics
socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("Socket disconnected:", reason);
});

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error.message);
});

socket.io.on("reconnect_attempt", (attempt) => {
  console.log("Socket reconnect attempt:", attempt);
});

socket.io.on("reconnect", (attempt) => {
  console.log("Socket reconnected after attempts:", attempt);
});

socket.io.on("reconnect_error", (error) => {
  console.error("Socket reconnect error:", error.message);
});

socket.io.on("reconnect_failed", () => {
  console.error("Socket reconnection failed");
});
