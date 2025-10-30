// backend/server.js
// Minimal, robust Socket.IO-based matching server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 25000,
  pingTimeout: 60000,
});

const PORT = process.env.PORT || 4000;

// In-memory structures
const waitlist = [];                   // sockets waiting
const activeRooms = new Map();         // roomId -> [socketA, socketB]
const sessions = new Map();            // userId -> { name, gender, interests } (for restore)

// Helpers
function getShared(a = [], b = []) {
  return a.filter(x => b.includes(x));
}
function removeFromWaitlist(s) {
  const i = waitlist.indexOf(s);
  if (i !== -1) waitlist.splice(i, 1);
}
function leaveRoom(socket) {
  for (const [roomId, members] of activeRooms) {
    if (members.includes(socket)) {
      // notify other and cleanup
      const other = members.find(s => s !== socket);
      try { other?.emit('chat_ended'); } catch(e){}
      members.forEach(s => { try { s.leave(roomId); } catch(e){} });
      activeRooms.delete(roomId);
      return roomId;
    }
  }
  return null;
}
function createRoom(a, b, shared) {
  // safety: ensure neither is already in an active room
  leaveRoom(a); leaveRoom(b);
  removeFromWaitlist(a); removeFromWaitlist(b);

  const roomId = `${a.id}-${b.id}-${Date.now()}`;
  a.join(roomId);
  b.join(roomId);
  activeRooms.set(roomId, [a, b]);

  // send match info to both
  try {
    a.emit('match_found', { roomId, partner: { name: b.data?.name || 'Anonymous', gender: b.data?.gender || 'Unknown' }, shared });
    b.emit('match_found', { roomId, partner: { name: a.data?.name || 'Anonymous', gender: a.data?.gender || 'Unknown' }, shared });
  } catch (e) { console.error(e); }
  console.log(`MATCH ${a.data?.name || a.id} <-> ${b.data?.name || b.id} (shared:${shared.join(',')||'none'})`);
  return roomId;
}

// Basic per-socket message throttling
const lastMsgTime = new Map();
function canSend(socket) {
  const now = Date.now();
  const last = lastMsgTime.get(socket.id) || 0;
  if (now - last < 400) return false; // 400ms throttle
  lastMsgTime.set(socket.id, now);
  return true;
}

// Socket events
io.on('connection', socket => {
  console.log('connect', socket.id);
  io.emit('user_count', io.engine.clientsCount);

  // Handle restore session (client sends { userId })
  socket.on('restore_session', (session) => {
    if (!session || !session.userId) {
      socket.emit('no_session');
      return;
    }
    const saved = sessions.get(session.userId);
    if (saved) {
      socket.data = { ...saved };
      socket.emit('session_restored', saved);
      console.log('restored session for', session.userId);
    } else {
      socket.emit('no_session');
    }
  });

  // join_waitlist: { interests: [], user: {name,gender}, userId }
  socket.on('join_waitlist', (payload) => {
    try {
      const { interests = [], user = {}, userId } = payload || {};
      socket.data = { ...user, interests };
      if (userId) sessions.set(userId, { ...user, interests });

      // ensure no duplicate
      removeFromWaitlist(socket);
      leaveRoom(socket);

      waitlist.push(socket);
      socket.emit('waiting');

      // Find best match: shared interests first
      let match = null;
      for (const other of waitlist) {
        if (other.id === socket.id) continue;
        const shared = getShared(socket.data.interests, other.data?.interests || []);
        if (shared.length > 0) { match = other; break; }
      }

      if (match) {
        const shared = getShared(socket.data.interests, match.data.interests);
        createRoom(socket, match, shared);
        return;
      }

      // Fallback random after short delay (5s)
      setTimeout(() => {
        if (!waitlist.includes(socket)) return;
        // pick any other
        const other = waitlist.find(s => s.id !== socket.id);
        if (other) createRoom(socket, other, []);
        else socket.emit('waiting');
      }, 5000);

    } catch (e) { console.error(e); socket.emit('error', 'join_failed'); }
  });

  // Restore quick: message pass through
  socket.on('send_message', ({ roomId, message }) => {
    if (!roomId || !message) return;
    if (!canSend(socket)) return; // throttle
    socket.to(roomId).emit('receive_message', { text: message });
  });

  socket.on('typing', ({ roomId }) => {
    if (!roomId) return;
    socket.to(roomId).emit('user_typing');
  });

  socket.on('leave_chat', ({ roomId }) => {
    const members = activeRooms.get(roomId);
    if (members) {
      io.to(roomId).emit('chat_ended');
      members.forEach(s => { try { s.leave(roomId); } catch(e){} });
      activeRooms.delete(roomId);
    } else {
      // ensure socket requeued
      removeFromWaitlist(socket);
      waitlist.push(socket);
      socket.emit('waiting');
    }
  });

  socket.on('skip_chat', ({ roomId }) => {
    // end current room (if any) and put the user back to waitlist
    const members = activeRooms.get(roomId);
    if (members) {
      io.to(roomId).emit('chat_ended');
      members.forEach(s => { try { s.leave(roomId); } catch(e){} });
      activeRooms.delete(roomId);
    }
    removeFromWaitlist(socket);
    waitlist.push(socket);
    socket.emit('waiting');
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    removeFromWaitlist(socket);
    // if in active room, notify partner
    for (const [roomId, members] of activeRooms.entries()) {
      if (members.includes(socket)) {
        const partner = members.find(s => s !== socket);
        try { partner?.emit('partner_disconnected'); } catch(e){}
        // cleanup
        members.forEach(s => { try { s.leave(roomId); } catch(e){} });
        activeRooms.delete(roomId);
        break;
      }
    }
    io.emit('user_count', io.engine.clientsCount);
  });
});

app.get('/', (req, res) => res.send('ChatMitra server alive'));
server.listen(PORT, () => console.log('Server on', PORT));
