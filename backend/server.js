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

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });

  socket.on("join_waitlist", (data) => {
    const { interests = [], user = {} } = data;
    socket.data = { ...user, interests };
    waitlist.push(socket);

    // Try best match
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

      const shared = getSharedInterests(match.data.interests, interests);

      // remove from waiting list
      waitlist.splice(waitlist.indexOf(match), 1);
      waitlist.splice(waitlist.indexOf(socket), 1);

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

      console.log(`✅ Match found between ${socket.data.name} and ${match.data.name}`);
    } else {
      socket.emit("waiting");

      // fallback random match
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

            socket.emit("match_found", {
              roomId,
              partner: { name: random.data.name, gender: random.data.gender, shared: [] },
            });

            random.emit("match_found", {
              roomId,
              partner: { name: socket.data.name, gender: socket.data.gender, shared: [] },
            });

            console.log(`🎲 Random match between ${socket.data.name} and ${random.data.name}`);
          }
        }
      }, 8000);
    }
  });

  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", { text: message });
  });

  // ✅ Skip Chat
  socket.on("skip_chat", ({ roomId }) => {
    const members = activeRooms[roomId];
    if (members) {
      // notify partner
      members.forEach((s) => {
        if (s.id !== socket.id) s.emit("partner_disconnected");
      });
      members.forEach((s) => s.leave(roomId));
      delete activeRooms[roomId];
    }

    // rejoin queue
    waitlist.push(socket);
    socket.emit("waiting");
    console.log(`${socket.id} skipped and rejoined waitlist`);
  });

  // ✅ Leave Chat (logo click)
  socket.on("leave_chat", ({ roomId }) => {
    const members = activeRooms[roomId];
    if (members) {
      members.forEach((s) => {
        if (s.id !== socket.id) s.emit("partner_disconnected");
      });
      members.forEach((s) => s.leave(roomId));
      delete activeRooms[roomId];
    }
    socket.emit("chat_ended");
  });
});

app.get("/", (_, res) => res.send("Server running ✅"));
server.listen(PORT, () => console.log("Server live on port", PORT));
