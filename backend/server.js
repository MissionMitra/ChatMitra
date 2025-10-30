const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");

const app = express();
app.use(helmet());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const waitlist = [];
const activeRooms = {};
const PORT = process.env.PORT || 4000;

function getSharedInterests(a, b) {
  return a.filter((x) => b.includes(x));
}

function removeFromWaitlist(socket) {
  const index = waitlist.indexOf(socket);
  if (index !== -1) waitlist.splice(index, 1);
}

function leaveActiveRoom(socket) {
  for (const [roomId, members] of Object.entries(activeRooms)) {
    if (members.includes(socket)) {
      io.to(roomId).emit("chat_ended");
      members.forEach((s) => s.leave(roomId));
      delete activeRooms[roomId];
      break;
    }
  }
}

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  io.emit("user_count", io.engine.clientsCount);

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    removeFromWaitlist(socket);
    leaveActiveRoom(socket);
    io.emit("user_count", io.engine.clientsCount);
  });

  socket.on("join_waitlist", (data) => {
    const { interests = [], user = {} } = data;
    socket.data = { ...user, interests };

    removeFromWaitlist(socket);
    leaveActiveRoom(socket);
    waitlist.push(socket);

    console.log(`🕒 ${socket.data.name} joined waitlist (${waitlist.length} waiting)`);

    const match = waitlist.find(
      (other) =>
        other.id !== socket.id &&
        other.data &&
        getSharedInterests(other.data.interests, interests).length > 0
    );

    if (match) {
      const roomId = `${socket.id}-${match.id}`;
      socket.join(roomId);
      match.join(roomId);

      const shared = getSharedInterests(socket.data.interests, match.data.interests);

      removeFromWaitlist(socket);
      removeFromWaitlist(match);

      activeRooms[roomId] = [socket, match];

      socket.emit("match_found", {
        roomId,
        partner: {
          name: match.data.name,
          gender: match.data.gender,
          shared,
        },
      });

      match.emit("match_found", {
        roomId,
        partner: {
          name: socket.data.name,
          gender: socket.data.gender,
          shared,
        },
      });

      console.log(`✅ Match: ${socket.data.name} ↔ ${match.data.name}`);
    } else {
      socket.emit("waiting");

      setTimeout(() => {
        if (waitlist.includes(socket)) {
          const random = waitlist.find((s) => s.id !== socket.id);
          if (random) {
            const roomId = `${socket.id}-${random.id}`;
            socket.join(roomId);
            random.join(roomId);

            removeFromWaitlist(socket);
            removeFromWaitlist(random);

            activeRooms[roomId] = [socket, random];

            socket.emit("match_found", {
              roomId,
              partner: { name: random.data.name, gender: random.data.gender, shared: [] },
            });

            random.emit("match_found", {
              roomId,
              partner: { name: socket.data.name, gender: socket.data.gender, shared: [] },
            });

            console.log(`🎲 Random match: ${socket.data.name} ↔ ${random.data.name}`);
          }
        }
      }, 8000);
    }
  });

  socket.on("send_message", ({ roomId, message }) => {
    if (activeRooms[roomId]) {
      socket.to(roomId).emit("receive_message", { text: message });
    }
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
    leaveActiveRoom(socket);
    removeFromWaitlist(socket);
    waitlist.push(socket);
    socket.emit("waiting");
    console.log(`⏭️ ${socket.data.name} skipped chat and rejoined waitlist`);
  });
});

app.get("/", (_, res) => res.send("Server running ✅"));
server.listen(PORT, () => console.log("Server live on port", PORT));
