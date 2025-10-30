const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const waiting = []; // { socketId, interests, ts }
const rooms = new Map(); // roomId -> { users: [sid1,sid2], messages: [] }

// helper: find best match by interest overlap
function findMatch(interests, excludeId) {
  for (let i = 0; i < waiting.length; i++) {
    const cand = waiting[i];
    if (cand.socketId === excludeId) continue;
    const overlap = cand.interests.filter(x => interests.includes(x));
    if (overlap.length > 0) {
      waiting.splice(i,1);
      return cand;
    }
  }
  return null;
}

// fallback: get any waiting user (random)
function pickAny(excludeId) {
  for (let i=0;i<waiting.length;i++){
    if (waiting[i].socketId === excludeId) continue;
    return waiting.splice(i,1)[0];
  }
  return null;
}

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const waitlist = [];
const activeRooms = {};
const PORT = process.env.PORT || 10000;

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Broadcast updated online user count
  io.emit("user_count", io.engine.clientsCount);

  // Handle disconnects
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);
  });

  // When user joins waiting list
  socket.on("join_waitlist", (data) => {
    socket.data.interests = data.interests || [];
    waitlist.push(socket);

    // Try matching with someone with shared interests
    const match = waitlist.find(
      (other) =>
        other.id !== socket.id &&
        other.data &&
        other.data.interests.some((i) => socket.data.interests.includes(i))
    );

    if (match) {
      const roomId = `${socket.id}-${match.id}`;
      socket.join(roomId);
      match.join(roomId);
      waitlist.splice(waitlist.indexOf(match), 1);
      waitlist.splice(waitlist.indexOf(socket), 1);
      activeRooms[roomId] = [socket, match];
      io.to(roomId).emit("match_found", { roomId });
    } else {
      socket.emit("waiting");
      // fallback random match if idle
      setTimeout(() => {
        if (waitlist.includes(socket)) {
          const random = waitlist.find((s) => s.id !== socket.id);
          if (random) {
            const roomId = `${socket.id}-${random.id}`;
            socket.join(roomId);
            random.join(roomId);
            waitlist.splice(waitlist.indexOf(random), 1);
            waitlist.splice(waitlist.indexOf(socket), 1);
            activeRooms[roomId] = [socket, random];
            io.to(roomId).emit("match_found", { roomId });
          }
        }
      }, 8000);
    }
  });

  // Messaging
  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", { text: message });
  });

  // End chat
  socket.on("leave_chat", ({ roomId }) => {
    io.to(roomId).emit("chat_ended");
    const members = activeRooms[roomId];
    if (members) members.forEach((s) => s.leave(roomId));
    delete activeRooms[roomId];
  });

  // ✅ Typing indicator
  socket.on("typing", ({ roomId }) => {
    socket.to(roomId).emit("user_typing");
  });
  socket.on("stop_typing", ({ roomId }) => {
    socket.to(roomId).emit("user_stopped_typing");
  });
});

app.get("/", (_, res) => res.send("Server running ✅"));

server.listen(PORT, () => console.log(`Server live on port ${PORT}`));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Server listening on', PORT));
