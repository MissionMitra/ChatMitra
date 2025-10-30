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
const PORT = process.env.PORT || 4000;

function getSharedInterests(a, b) {
  return a.filter((x) => b.includes(x));
}

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  io.emit("user_count", io.engine.clientsCount);

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);
  });

  socket.on("join_waitlist", (data) => {
    const { interests = [], user = {} } = data;
    socket.data = { ...user, interests };
    waitlist.push(socket);
    console.log("🕒 Waiting list:", waitlist.length);

    // Try to find best match by shared interests
    const match = waitlist.find(
      (other) =>
        other.id !== socket.id &&
        other.data &&
        getSharedInterests(other.data.interests, interests).length > 0
    );

    // If found a match
    if (match) {
      const roomId = `${socket.id}-${match.id}`;
      socket.join(roomId);
      match.join(roomId);

      const shared = getSharedInterests(match.data.interests, interests);

      // Remove both from waiting list
      waitlist.splice(waitlist.indexOf(match), 1);
      waitlist.splice(waitlist.indexOf(socket), 1);

      activeRooms[roomId] = [socket, match];

      // Send match info to both
     // Notify each user with their partner’s info
socket.emit("match_found", {
  roomId,
  partner: {
    name: match.data.name,
    gender: match.data.gender,
    shared: socket.data.interests.filter(i => match.data.interests.includes(i))
  }
});

match.emit("match_found", {
  roomId,
  partner: {
    name: socket.data.name,
    gender: socket.data.gender,
    shared: match.data.interests.filter(i => socket.data.interests.includes(i))
  }
});


      console.log(`✅ Match found between ${socket.data.name} and ${match.data.name}`);
    } else {
      socket.emit("waiting");
      // fallback random match after 10s if no interest match
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
            io.to(roomId).emit("match_found", {
              roomId,
              you: socket.data,
              partner: random.data,
              shared: [],
            });
            console.log(`🎲 Random match between ${socket.data.name} and ${random.data.name}`);
          }
        }
      }, 10000);
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
  // ✅ Skip current chat and look for next
socket.on("skip_chat", ({ roomId }) => {
  const members = activeRooms[roomId];
  if (members) {
    io.to(roomId).emit("chat_ended"); // notify both users that chat ended
    members.forEach(s => s.leave(roomId));
    delete activeRooms[roomId];
  }

  // After ending, put the user back into the waiting list to find a new match
  waitlist.push(socket);
  socket.emit("waiting");
  console.log(`${socket.id} skipped chat and rejoined waitlist`);
});
});

app.get("/", (_, res) => res.send("Server running ✅"));

server.listen(PORT, () => console.log("Server live on port", PORT));
