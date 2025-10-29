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

io.on('connection', (socket) => {
  console.log('connected', socket.id);

  socket.on('join_waitlist', ({ interests = [] } = {}) => {
    // try match by interests first
    const match = findMatch(interests, socket.id);
    if (match) {
      const roomId = Math.random().toString(36).slice(2,9);
      const room = { users: [socket.id, match.socketId], messages: [] };
      rooms.set(roomId, room);
      socket.join(roomId);
      io.to(match.socketId).socketsJoin(roomId);
      io.to(roomId).emit('match_found', { roomId, interests });
      console.log('matched by interest', roomId);
      return;
    }

    // no interest match -> put in waiting, setup timeout fallback
    waiting.push({ socketId: socket.id, interests, ts: Date.now() });
    socket.emit('waiting');

    // after 8 seconds, if still waiting, fallback to any available user
    setTimeout(() => {
      const idx = waiting.findIndex(w => w.socketId === socket.id);
      if (idx === -1) return;
      const other = pickAny(socket.id);
      if (other) {
        const roomId = Math.random().toString(36).slice(2,9);
        const room = { users: [socket.id, other.socketId], messages: [] };
        rooms.set(roomId, room);
        socket.join(roomId);
        io.to(other.socketId).socketsJoin(roomId);
        io.to(roomId).emit('match_found', { roomId, interests });
        console.log('matched by fallback', roomId);
      } else {
        // still no match; keep waiting
      }
    }, 8000);
  });

  socket.on('send_message', ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.messages.push({ from: socket.id, text: message, ts: Date.now() });
    io.to(roomId).emit('receive_message', { from: socket.id, text: message });
  });

  socket.on('leave_chat', ({ roomId } = {}) => {
    const room = rooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('chat_ended');
    room.users.forEach(sid => {
      try { io.sockets.sockets.get(sid)?.leave(roomId); } catch(e){}
    });
    rooms.delete(roomId);
    console.log('room ended', roomId);
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const wi = waiting.findIndex(w => w.socketId === socket.id);
    if (wi !== -1) waiting.splice(wi,1);
    for (const [roomId, room] of rooms.entries()) {
      if (room.users.includes(socket.id)) {
        io.to(roomId).emit('chat_ended');
        room.users.forEach(sid => {
          try { io.sockets.sockets.get(sid)?.leave(roomId); } catch(e){}
        });
        rooms.delete(roomId);
        console.log('cleaned room on disconnect', roomId);
        break;
      }
    }
  });

});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Server listening on', PORT));
