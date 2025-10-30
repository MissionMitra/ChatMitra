// backend/server.js
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
  cors: { origin: "*" },
  // Keepalive tuning for more reliable websockets on hosts that sleep/wake
  pingInterval: 25000,
  pingTimeout: 60000,
});

const waitlist = [];            // sockets waiting for match
const activeRooms = {};        // roomId -> [socketA, socketB]
const PORT = process.env.PORT || 4000;

function getSharedInterests(a = [], b = []) {
  return a.filter((x) => b.includes(x));
}

function putBackToWaitlist(socket) {
  // ensure socket is not duplicated in waitlist
  if (!waitlist.includes(socket)) {
    waitlist.push(socket);
    try { socket.emit("waiting"); } catch (e) {}
  }
}

// Remove socket from waitlist if exists
function removeFromWaitlist(socket) {
  const idx = waitlist.indexOf(socket);
  if (idx !== -1) waitlist.splice(idx, 1);
}

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  io.emit("user_count", io.engine.clientsCount);

  // cleanup on disconnect
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);

    // if user was waiting, remove them
    removeFromWaitlist(socket);

    // if user was in an active room, inform partner and put partner back to waitlist
    for (const roomId of Object.keys(activeRooms)) {
      const members = activeRooms[roomId];
      if (members && members.includes(socket)) {
        const other = members.find((s) => s.id !== socket.id);
        if (other) {
          try { other.emit("chat_ended"); } catch(e){}
          other.leave(roomId);
          putBackToWaitlist(other);
        }
        // remove room
        delete activeRooms[roomId];
      }
    }
  });

  // join waitlist and attempt to match immediately
  socket.on("join_waitlist", (data) => {
    const { interests = [], user = {} } = data;
    socket.data = { ...user, interests: interests || [] };

    // avoid duplicate entries
    if (!waitlist.includes(socket)) waitlist.push(socket);
    console.log("🕒 Waitlist size:", waitlist.length);

    // Try interest-based match first
    let match = waitlist.find((other) =>
      other.id !== socket.id &&
      other.data &&
      getSharedInterests(other.data.interests, socket.data.interests).length > 0
    );

    // Fallback: if no interest-based match, pick any available user
    if (!match) {
      match = waitlist.find((other) => other.id !== socket.id);
    }

    if (match) {
      // create room and join both
      const roomId = `${socket.id}-${match.id}`;
      socket.join(roomId);
      match.join(roomId);

      // compute shared interests (could be empty)
      const shared = getSharedInterests(match.data.interests, socket.data.interests);

      // remove both from waitlist
      removeFromWaitlist(match);
      removeFromWaitlist(socket);

      activeRooms[roomId] = [socket, match];

      // notify each individually with their partner's info
      try {
        socket.emit("match_found", {
          roomId,
          partner: {
            name: match.data.name || "Anonymous",
            gender: match.data.gender || "Unknown",
            shared,
          },
        });
      } catch (e) {}

      try {
        match.emit("match_found", {
          roomId,
          partner: {
            name: socket.data.name || "Anonymous",
            gender: socket.data.gender || "Unknown",
            shared,
          },
        });
      } catch (e) {}

      console.log(`✅ Matched: ${socket.data.name || socket.id} ↔ ${match.data.name || match.id} (shared: ${shared.join(", ") || "none"})`);
    } else {
      // no one available
      socket.emit("waiting");
      console.log(`${socket.data.name || socket.id} waiting for partner...`);
    }
  });

  // message pass-through (ephemeral)
  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", { text: message });
  });

  // user requests to leave chat
  socket.on("leave_chat", ({ roomId }) => {
    const members = activeRooms[roomId];
    if (members) {
      io.to(roomId).emit("chat_ended");
      members.forEach((s) => {
        try { s.leave(roomId); } catch (e) {}
        putBackToWaitlist(s);
      });
      delete activeRooms[roomId];
    } else {
      // if no room found, just ensure socket is requeued
      putBackToWaitlist(socket);
    }
  });

  // skip: end current and rematch quickly
  socket.on("skip_chat", ({ roomId }) => {
    const members = activeRooms[roomId];
    if (members) {
      io.to(roomId).emit("chat_ended");
      members.forEach((s) => {
        try { s.leave(roomId); } catch (e) {}
        // put both back to waitlist so they can be rematched quickly
        putBackToWaitlist(s);
      });
      delete activeRooms[roomId];
    } else {
      putBackToWaitlist(socket);
    }
    console.log(`${socket.data?.name || socket.id} skipped chat and rejoined waitlist`);
  });

  // typing indicators (optional)
  socket.on("typing", ({ roomId }) => {
    socket.to(roomId).emit("user_typing");
  });
  socket.on("stop_typing", ({ roomId }) => {
    socket.to(roomId).emit("user_stopped_typing");
  });
});

app.get("/", (_, res) => res.send("Server running ✅"));

server.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));
