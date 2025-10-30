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

// Helper function for shared interests
function getSharedInterests(a = [], b = []) {
  return a.filter((x) => b.includes(x));
}

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  io.emit("user_count", io.engine.clientsCount);

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);

    // Remove from waitlist if still waiting
    const idx = waitlist.indexOf(socket);
    if (idx !== -1) waitlist.splice(idx, 1);
  });

  // 🚀 Join waitlist
  socket.on("join_waitlist", (data) => {
    const { interests = [], user = {} } = data;
    socket.data = { ...user, interests };

    // Avoid duplicates in waitlist
    if (!waitlist.includes(socket)) waitlist.push(socket);
    console.log("🕒 Waiting list:", waitlist.length);

    // Try to match by shared interests
    let match = waitlist.find(
      (other) =>
        other.id !== socket.id &&
        other.data &&
        getSharedInterests(other.data.interests, interests).length > 0
    );

    // If no interest-based match, fallback to any random available user
    if (!match) {
      match = waitlist.find((s) => s.id !== socket.id);
    }

    // ✅ If a match is found (either by interest or random)
    if (match) {
      const roomId = `${socket.id}-${match.id}`;
      socket.join(roomId);
      match.join(roomId);

      const shared = getSharedInterests(match.data.interests, interests);

      // Remove both from waitlist
      waitlist.splice(waitlist.indexOf(match), 1);
      waitlist.splice(waitlist.indexOf(socket), 1);

      activeRooms[roomId] = [socket, match];

      // Send match info to both
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

      console.log(
        `✅ Match found between ${socket.data.name} and ${match.data.name} (${shared.join(", ") || "no shared interests"})`
      );
    } else {
      socket.emit("waiting");
      console.log(`${socket.data.name} is waiting for a match...`);
    }
  });

  // 💬 Message handling
  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", { text: message });
  });

  // ❌ End chat manually
  socket.on("leave_chat", ({ roomId }) => {
    io.to(roomId).emit("chat_ended");
    const members = activeRooms[roomId];
    if (members) members.forEach((s) => s.leave(roomId));
    delete activeRooms[roomId];
  });

  // ⏭️ Skip current chat and look for next
  socket.on("skip_chat", ({ roomId }) => {
    const members = activeRooms[roomId];
    if (members) {
      io.to(roomId).emit("chat_ended");
      members.forEach((s) => s.leave(roomId));
      delete activeRooms[roomId];
    }

    // Put user back to waitlist
    if (!waitlist.includes(socket)) waitlist.push(socket);
    socket.emit("waiting");
    console.log(`${socket.data.name || socket.id} skipped chat and rejoined waitlist`);
  });
});

app.get("/", (_, res) => res.send("Server running ✅"));

server.listen(PORT, () => console.log("🚀 Server live on port", PORT));
