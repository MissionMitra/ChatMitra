// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 60000,
});

const PORT = process.env.PORT || 4000;

// In-memory structures (MVP)
const waitlist = [];                 // sockets waiting for match
const activeRooms = new Map();       // roomId -> [socketA, socketB]
const sessions = new Map();          // userId -> { name, gender, interests } (for restore)

// Helpers
function getShared(a = [], b = []) {
  return a.filter(x => b.includes(x));
}
function removeFromWaitlist(s) {
  const i = waitlist.indexOf(s);
  if (i !== -1) waitlist.splice(i, 1);
}
function socketInRoom(socket) {
  for (const members of activeRooms.values()) {
    if (members.includes(socket)) return true;
  }
  return false;
}
function leaveAnyRoom(socket) {
  for (const [roomId, members] of activeRooms.entries()) {
    if (members.includes(socket)) {
      // notify other
      const other = members.find(s => s !== socket);
      try { other?.emit("chat_ended"); } catch(e) {}
      members.forEach(s => { try { s.leave(roomId); } catch(e) {} });
      activeRooms.delete(roomId);
      return roomId;
    }
  }
  return null;
}
function createRoom(a, b, shared) {
  // safety: ensure neither is in another room
  removeFromWaitlist(a);
  removeFromWaitlist(b);
  leaveAnyRoom(a);
  leaveAnyRoom(b);

  const roomId = `${a.id}-${b.id}-${Date.now()}`;
  a.join(roomId);
  b.join(roomId);
  activeRooms.set(roomId, [a, b]);

  // store shared list per partner payload
  try {
    a.emit("match_found", {
      roomId,
      partner: {
        name: b.data?.name || "Anonymous",
        gender: b.data?.gender || "Unknown"
      },
      shared: shared || []
    });
  } catch (e) {}
  try {
    b.emit("match_found", {
      roomId,
      partner: {
        name: a.data?.name || "Anonymous",
        gender: a.data?.gender || "Unknown"
      },
      shared: shared || []
    });
  } catch (e) {}

  console.log(`MATCH ${a.data?.name || a.id} <-> ${b.data?.name || b.id} (shared: ${shared.join(",") || "none"})`);
  return roomId;
}

// simple per-socket throttle to avoid flooding
const lastMsg = new Map();
function canSend(socket) {
  const now = Date.now();
  const prev = lastMsg.get(socket.id) || 0;
  if (now - prev < 150) return false; // 150ms encouraged throttle
  lastMsg.set(socket.id, now);
  return true;
}

// Socket.io events
io.on("connection", (socket) => {
  console.log("connect:", socket.id);
  // Note: we intentionally removed broadcasting global user_count per your request.

  // Restore session (client provides { userId })
  socket.on("restore_session", (session) => {
    if (!session || !session.userId) {
      socket.emit("no_session");
      return;
    }
    const saved = sessions.get(session.userId);
    if (saved) {
      socket.data = { ...saved };
      socket.emit("session_restored", saved);
      console.log("session restored for", saved.name || session.userId);
    } else {
      socket.emit("no_session");
    }
  });

  // Join waitlist and attempt matching
  socket.on("join_waitlist", (payload) => {
    try {
      const { interests = [], user = {}, userId } = payload || {};

      // store session if provided
      if (userId) sessions.set(userId, { ...user, interests });

      // attach user info to socket
      socket.data = { ...user, interests: interests || [], userId };

      // Prevent duplicates: remove existing waitlist entry and leave any room
      removeFromWaitlist(socket);
      leaveAnyRoom(socket);

      // If user is currently already in an active room, ignore join request
      if (socketInRoom(socket)) {
        socket.emit("waiting");
        return;
      }

      waitlist.push(socket);
      socket.emit("waiting");

      // First try to find match by shared interests
      let match = null;
      for (const other of waitlist) {
        if (other.id === socket.id) continue;
        if (!other.data) continue;
        const shared = getShared(socket.data.interests || [], other.data.interests || []);
        if (shared.length > 0) { match = other; break; }
      }

      if (match) {
        const shared = getShared(socket.data.interests || [], match.data.interests || []);
        createRoom(socket, match, shared);
        return;
      }

      // fallback random after 2 seconds (faster)
      setTimeout(() => {
        if (!waitlist.includes(socket)) return;
        const random = waitlist.find(s => s.id !== socket.id);
        if (random) {
          createRoom(socket, random, []);
        } else {
          socket.emit("waiting");
        }
      }, 2000);
    } catch (err) {
      console.error("join_waitlist error:", err);
      socket.emit("error", "join_failed");
    }
  });

  // message passing (only to room)
  socket.on("send_message", ({ roomId, message }) => {
    if (!roomId || !message) return;
    if (!activeRooms.has(roomId)) return;
    if (!canSend(socket)) return;
    // forward to other participants
    socket.to(roomId).emit("receive_message", { text: message });
  });

  // typing indicator
  socket.on("typing", ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit("user_typing");
  });

  // leave chat (user ends)
  socket.on("leave_chat", ({ roomId }) => {
    const members = activeRooms.get(roomId);
    if (members) {
      io.to(roomId).emit("chat_ended");
      members.forEach(s => { try { s.leave(roomId); } catch(e) {} });
      activeRooms.delete(roomId);
    } else {
      // if not in room, ensure user returned to waitlist
      removeFromWaitlist(socket);
      waitlist.push(socket);
      socket.emit("waiting");
    }
  });

  // skip chat: end room and requeue requester immediately
  socket.on("skip_chat", ({ roomId }) => {
    const members = activeRooms.get(roomId);
    if (members) {
      // inform both and remove room
      io.to(roomId).emit("chat_ended");
      members.forEach(s => { try { s.leave(roomId); } catch(e) {} });
      activeRooms.delete(roomId);
    }
    // put the skipping socket back into waitlist for quick rematch
    removeFromWaitlist(socket);
    waitlist.push(socket);
    socket.emit("waiting");
  });

  // disconnect cleanup
  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);
    removeFromWaitlist(socket);
    // if in room, inform partner and cleanup
    for (const [roomId, members] of activeRooms.entries()) {
      if (members.includes(socket)) {
        const partner = members.find(s => s !== socket);
        try { partner?.emit("partner_disconnected"); } catch(e) {}
        members.forEach(s => { try { s.leave(roomId); } catch(e) {} });
        activeRooms.delete(roomId);
        break;
      }
    }
  });
});

app.get("/", (_, res) => res.send("ChatMitra server running"));
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
