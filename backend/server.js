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
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- In-memory data ---
const waitlist = [];
const activeRooms = {};
const cache = {}; // To store reconnect interests
const avatars = {}; // Random avatar colors per user

// --- Helper function ---
function randomColor() {
  const colors = ["#00BCD4", "#4CAF50", "#FF9800", "#9C27B0", "#E91E63"];
  return colors[Math.floor(Math.random() * colors.length)];
}

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);
  avatars[socket.id] = randomColor();

  // Broadcast online count
  io.emit("user_count", io.engine.clientsCount);

  // --- Handle disconnection ---
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    io.emit("user_count", io.engine.clientsCount);
  });

  // --- Join Waitlist ---
  socket.on("join_waitlist", (data) => {
    socket.data.interests = data.interests || [];
    cache[socket.id] = socket.data.interests;
    waitlist.push(socket);

    // Find best match
    const match = waitlist.find(
      (other) =>
        other.id !== socket.id &&
        other.data &&
        other.data.interests.some((i) =>
          socket.data.interests.includes(i)
        )
    );

    if (match) {
      const roomId = `${socket.id}-${match.id}`;
      socket.join(roomId);
      match.join(roomId);

      waitlist.splice(waitlist.indexOf(match), 1);
      waitlist.splice(waitlist.indexOf(socket), 1);

      activeRooms[roomId] = [socket, match];
      io.to(roomId).emit("match_found", {
        roomId,
        avatars: {
          [socket.id]: avatars[socket.id],
          [match.id]: avatars[match.id],
        },
      });
    } else {
      socket.emit("waiting");
      // Fallback random after 8s
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
              avatars: {
                [socket.id]: avatars[socket.id],
                [random.id]: avatars[random.id],
              },
            });
          }
        }
      }, 8000);
    }
  });

  // --- Messaging ---
  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", {
      text: message,
      from: socket.id,
    });
  });

  // --- Typing indicator ---
  socket.on("typing", ({ roomId }) => {
    socket.to(roomId).emit("user_typing");
  });
  socket.on("stop_typing", ({ roomId }) => {
    socket.to(roomId).emit("user_stopped_typing");
  });

  // --- End chat ---
  socket.on("leave_chat", ({ roomId }) => {
    io.to(roomId).emit("chat_ended");
    const members = activeRooms[roomId];
    if (members) members.forEach((s) => s.leave(roomId));
    delete activeRooms[roomId];
  });
});

// --- Default route ---
app.get("/", (_, res) => res.send("Server running ✅"));

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));
