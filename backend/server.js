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

const PORT = process.env.PORT || 4000;

const waitlist = [];
const activeRooms = {}; // { roomId: [socketA, socketB] }
const userSessions = {}; // for reconnection tracking

function getSharedInterests(a, b) {
  return a.filter((x) => b.includes(x));
}

// 🔁 Helper: Create a chat room between two users
function makeMatch(a, b, shared = []) {
  const roomId = `${a.id}-${b.id}`;
  a.join(roomId);
  b.join(roomId);

  // remove from waitlist
  if (waitlist.includes(a)) waitlist.splice(waitlist.indexOf(a), 1);
  if (waitlist.includes(b)) waitlist.splice(waitlist.indexOf(b), 1);

  activeRooms[roomId] = [a, b];

  // store for reconnection
  userSessions[a.id] = { partnerId: b.id, roomId };
  userSessions[b.id] = { partnerId: a.id, roomId };

  a.emit("match_found", {
    roomId,
    partner: { name: b.data.name, gender: b.data.gender, shared },
  });
  b.emit("match_found", {
    roomId,
    partner: { name: a.data.name, gender: a.data.gender, shared },
  });

  console.log(`✅ Match created: ${a.data.name} ↔ ${b.data.name}`);
}

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);
  io.emit("user_count", io.engine.clientsCount);

  // reconnect support
  socket.on("reconnect_session", ({ oldId }) => {
    const oldSession = userSessions[oldId];
    if (oldSession) {
      const { roomId, partnerId } = oldSession;
      const partnerSocket = [...io.sockets.sockets.values()].find(
        (s) => s.id === partnerId
      );
      if (partnerSocket) {
        socket.join(roomId);
        activeRooms[roomId] = [socket, partnerSocket];
        userSessions[socket.id] = oldSession;
        socket.emit("reconnected", { roomId });
        console.log(`🔄 ${socket.id} rejoined room ${roomId}`);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);

    // remove from waitlist if still waiting
    const idx = waitlist.indexOf(socket);
    if (idx !== -1) waitlist.splice(idx, 1);

    // handle disconnection inside a room
    for (const [roomId, members] of Object.entries(activeRooms)) {
      if (members.includes(socket)) {
        const partner = members.find((s) => s.id !== socket.id);
        if (partner) {
          partner.emit("partner_disconnected");
        }
        delete activeRooms[roomId];
        break;
      }
    }
  });

  socket.on("join_waitlist", (data) => {
    const { interests = [], user = {} } = data;
    socket.data = { ...user, interests };
    waitlist.push(socket);
    console.log("🕒 Waitlist:", waitlist.length);

    // try to find a best match
    const match = waitlist.find(
      (other) =>
        other.id !== socket.id &&
        other.data &&
        getSharedInterests(other.data.interests, interests).length > 0
    );

    if (match) {
      const shared = getSharedInterests(match.data.interests, interests);
      makeMatch(socket, match, shared);
    } else {
      socket.emit("waiting");
      // fallback to random after 6s if no interest match
      setTimeout(() => {
        if (waitlist.includes(socket)) {
          const random = waitlist.find((s) => s.id !== socket.id);
          if (random) {
            makeMatch(socket, random, []);
            console.log(
              `🎲 Random match: ${socket.data.name} ↔ ${random.data.name}`
            );
          }
        }
      }, 6000);
    }
  });

  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", { text: message });
  });

  socket.on("leave_chat", ({ roomId }) => {
    io.to(roomId).emit("chat_ended");
    const members = activeRooms[roomId];
    if (members) members.forEach((s) => s.leave(roomId));
    delete activeRooms[roomId];
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
    console.log(`${socket.id} skipped and rejoined waitlist`);
  });
});

app.get("/", (_, res) => res.send("✅ ChatMitra Server Active"));

server.listen(PORT, () =>
  console.log(`🚀 ChatMitra live on port ${PORT}`)
);
