import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
let socket;

export default function App() {
  const [view, setView] = useState('setup'); // setup → home → chat
  const [user, setUser] = useState({ name: '', gender: '', verified: false });
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState('');

  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState('');
  const [status, setStatus] = useState('Not connected');
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const inputRef = useRef();
  const msgBoxRef = useRef();

  const defaultTags = ['Travel', 'Food', 'Music', 'Friends'];

  useEffect(() => {
    socket = io(SOCKET_URL, { autoConnect: false });

    socket.on('connect', () => setStatus('Connected to server'));
    socket.on('waiting', () => setStatus('Searching for a partner...'));
    socket.on('user_count', (count) => setUserCount(count));

    socket.on('match_found', (data) => {
      setRoomId(data.roomId);
      setStatus(
        `Matched with ${data.partner.name} (${data.partner.gender}) — Shared: ${data.partner.shared.join(', ') || 'none'}`
      );
      setView('chat');
      setMessages([]);
    });

    socket.on('receive_message', (m) => {
      setMessages((prev) => [...prev, { from: 'them', text: m.text }]);
    });

    socket.on('chat_ended', () => {
      setStatus('Session ended');
      setRoomId(null);
      setMessages([]);
      setTimeout(() => setView('home'), 1000);
    });

    socket.on('disconnect', () => setStatus('Disconnected'));

    return () => {
      try {
        socket.disconnect();
        socket.off();
      } catch (e) {}
    };
  }, []);

  // 🧠 Verification question (bot check)
  function generateQuestion() {
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;
    setQuestion({ a, b });
  }

  useEffect(() => generateQuestion(), []);

  function verifyUser() {
    if (!user.name || !user.gender) {
      alert('Please enter your name and select gender');
      return;
    }
    if (parseInt(answer) !== question.a + question.b) {
      alert('Verification failed. Try again.');
      generateQuestion();
      setAnswer('');
      return;
    }
    setUser({ ...user, verified: true });
    setView('home');
  }

  function toggle(tag) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function addCustomInterest() {
    const trimmed = custom.trim();
    if (trimmed && !selected.includes(trimmed)) {
      setSelected((prev) => [...prev, trimmed]);
    }
    setCustom('');
  }

  function start() {
    socket.connect();
    setStatus('Connecting...');
    socket.emit('join_waitlist', { interests: selected, user });
  }

  function send() {
    const txt = inputRef.current.value.trim();
    if (!txt || !roomId) return;
    socket.emit('send_message', { roomId, message: txt });
    setMessages((prev) => [...prev, { from: 'me', text: txt }]);
    inputRef.current.value = '';
    msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
  }

  function endChat() {
    if (roomId) socket.emit('leave_chat', { roomId });
  }

  // 🆕 Skip current chat
  function skipChat() {
    if (roomId) {
      socket.emit('skip_chat', { roomId });
      setMessages([]);
      setStatus('Searching for next partner...');
    }
  }

  return (
    <div className="app">
      <div className="card">
        <header className="nav">
          <div className="logo">ChatMitra</div>
          <div className="badge">{userCount} online</div>
        </header>

        {/* STEP 1: Setup */}
        {view === 'setup' && (
          <div className="setup">
            <h2>Welcome to ChatMitra</h2>
            <p>Before you start, please verify you’re human 👇</p>

            <input
              type="text"
              placeholder="Enter your name"
              value={user.name}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
            />

            <div className="gender-select">
              {['Male', 'Female', 'Other'].map((g) => (
                <label key={g}>
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    checked={user.gender === g}
                    onChange={(e) => setUser({ ...user, gender: e.target.value })}
                  />
                  {g}
                </label>
              ))}
            </div>

            <div className="verify">
              <p>
                Solve: {question.a} + {question.b} = ?
              </p>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Answer"
              />
              <button onClick={verifyUser}>Verify & Continue</button>
            </div>
          </div>
        )}

        {/* STEP 2: Home */}
        {view === 'home' && (
          <div className="home">
            <h1>Hello, {user.name} 👋</h1>
            <p>Select a few interests to find your chat partner.</p>

            <div className="tags">
              {defaultTags.map((t) => (
                <button
                  key={t}
                  className={selected.includes(t) ? 'tag active' : 'tag'}
                  onClick={() => toggle(t)}
                >
                  {t}
                </button>
              ))}
              {selected
                .filter((t) => !defaultTags.includes(t))
                .map((t) => (
                  <button
                    key={t}
                    className="tag active"
                    onClick={() => toggle(t)}
                  >
                    {t}
                  </button>
                ))}
            </div>

            <div className="custom">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Add custom interest..."
              />
              <button onClick={addCustomInterest}>Add</button>
            </div>

            <button className="start" onClick={start}>
              Start Chat
            </button>
          </div>
        )}

        {/* STEP 3: Chat */}
        {view === 'chat' && (
          <div className="chat">
            <div className="chat-top">
              <div>{status}</div>
              <div>
                <button className="skip" onClick={skipChat}>
                  Skip
                </button>
                <button className="end" onClick={endChat}>
                  End
                </button>
              </div>
            </div>

            <div className="messages" ref={msgBoxRef}>
              {messages.map((m, i) => (
                <div key={i} className={m.from === 'me' ? 'msg me' : 'msg them'}>
                  {m.text}
                </div>
              ))}
            </div>

            <div className="composer">
              <input
                ref={inputRef}
                placeholder="Type your message..."
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button onClick={send}>Send</button>
            </div>
          </div>
        )}

        <footer className="foot">
          © {new Date().getFullYear()} ChatMitra — Ephemeral chats
        </footer>
      </div>
    </div>
  );
}
