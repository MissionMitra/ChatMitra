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
});

const waitlist = [];
const activeRooms = {};
const userSessions = {}; // userId -> { name, gender, interests }

const PORT = process.env.PORT || 4000;

function getSharedInterests(a, b) {
  return a.filter((x) => b.includes(x));
}

function removeFromWaitlist(socket) {
  const index = waitlist.indexOf(socket);
  if (index !== -1) waitlist.splice(index, 1);
}

function createRoom(socketA, socketB, shared) {
  const roomId = `${socketA.id}-${socketB.id}`;
  socketA.join(roomId);
  socketB.join(roomId);
  activeRooms[roomId] = [socketA, socketB];

  socketA.emit("match_found", {
    roomId,
    partner: {
      name: socketB.data.name,
      gender: socketB.data.gender,
    },
    shared,
  });

  socketB.emit("match_found", {
    roomId,
    partner: {
      name: socketA.data.name,
      gender: socketA.data.gender,
    },
    shared,
  });

  console.log(`✅ Match between ${socketA.data.name} and ${socketB.data.name}, shared: ${shared.join(", ") || "none"}`);
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);
  io.emit("user_count", io.engine.clientsCount);

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);
    removeFromWaitlist(socket);
  });

  // Reconnect users with session data
  socket.on("restore_session", (session) => {
    if (session && session.userId && userSessions[session.userId]) {
      socket.data = userSessions[session.userId];
      console.log(`♻️ Restored session for ${socket.data.name}`);
      socket.emit("session_restored", socket.data);
    } else {
      socket.emit("no_session");
    }
  });

  socket.on("join_waitlist", (data) => {
    const { interests = [], user = {}, userId } = data;

    // Save session data
    if (userId) {
      userSessions[userId] = { ...user, interests };
    }

    socket.data = { ...user, interests, userId };

    // Prevent duplicates
    removeFromWaitlist(socket);
    waitlist.push(socket);

    console.log(`🕓 ${user.name} joined waitlist (${waitlist.length} waiting)`);

    const match = waitlist.find(
      (other) =>
        other.id !== socket.id &&
        getSharedInterests(socket.data.interests, other.data.interests).length > 0
    );

    if (match) {
      const shared = getSharedInterests(socket.data.interests, match.data.interests);
      removeFromWaitlist(match);
      removeFromWaitlist(socket);
      createRoom(socket, match, shared);
    } else {
      // Fallback random after 5s
      setTimeout(() => {
        if (waitlist.includes(socket)) {
          const random = waitlist.find((s) => s.id !== socket.id);
          if (random) {
            removeFromWaitlist(random);
            removeFromWaitlist(socket);
            createRoom(socket, random, []);
          } else {
            socket.emit("waiting");
          }
        }
      }, 5000);
    }
  });

  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", { text: message });
  });

  socket.on("leave_chat", ({ roomId }) => {
    const members = activeRooms[roomId];
    if (members) {
      io.to(roomId).emit("chat_ended");
      members.forEach((s) => s.leave(roomId));
      delete activeRooms[roomId];
    }
  });

  socket.on("skip_chat", ({ roomId }) => {
    const members = activeRooms[roomId];
    if (members) {
      io.to(roomId).emit("chat_ended");
      members.forEach((s) => s.leave(roomId));
      delete activeRooms[roomId];
    }

    waitlist.push(socket);
    socket.emit("waiting");
    console.log(`${socket.data.name} skipped chat and rejoined`);
  });
});

app.get("/", (_, res) => res.send("Server running ✅"));
server.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));
