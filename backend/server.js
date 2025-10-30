// ✅ ChatMitra Backend — Clean, Fixed, and Upgraded (CommonJS syntax)

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
app.use(helmet());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔹 In-memory data stores
const waitlist = [];
const activeRooms = {};
const userInterests = new Map(); // to persist temporary interests

const PORT = process.env.PORT || 10000;

// 🧩 Handle connections
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Broadcast online user count
  io.emit("user_count", io.engine.clientsCount);

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);

    // Clean up from waitlist
    const idx = waitlist.findIndex((s) => s.id === socket.id);
    if (idx !== -1) waitlist.splice(idx, 1);

    // Clean up from activeRooms
    for (const [roomId, users] of Object.entries(activeRooms)) {
      if (users.find((u) => u.id === socket.id)) {
        io.to(roomId).emit("chat_ended");
        users.forEach((s) => s.leave(roomId));
        delete activeRooms[roomId];
        break;
      }
    }

    userInterests.delete(socket.id);
  });

  // 🟢 When user joins waiting list
  socket.on("join_waitlist", (data) => {
    const interests = data.interests || [];
    userInterests.set(socket.id, interests);
