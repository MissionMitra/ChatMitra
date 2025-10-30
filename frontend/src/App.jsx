import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
let socket;

export default function App() {
  const [view, setView] = useState("setup"); // setup -> home -> chat
  const [user, setUser] = useState({ name: "", gender: "", verified: false });
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState("");

  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef();
  const msgBoxRef = useRef();
  const messagesEndRef = useRef();

  const defaultTags = ["Travel", "Food", "Music", "Friends"];

  useEffect(() => {
    socket = io(SOCKET_URL, { autoConnect: false });

    socket.on("connect", () => {
      setStatus("Connected to server");
    });

    socket.on("waiting", () => {
      setSearching(true);
      setStatus("Searching for a partner...");
    });

    socket.on("user_count", (count) => setUserCount(count));

    socket.on("match_found", (data) => {
      setSearching(false);
      setRoomId(data.roomId || null);
      const partnerName = data.partner?.name || "Anonymous";
      const partnerGender = data.partner?.gender || "Unknown";
      const shared = (data.partner?.shared || []).join(", ") || "none";
      setStatus(`Matched with ${partnerName} (${partnerGender}) — Shared: ${shared}`);
      setMessages([]);
      setView("chat");
    });

    socket.on("receive_message", (m) => {
      setMessages((prev) => [...prev, { from: "them", text: m.text }]);
    });

    socket.on("chat_ended", () => {
      setStatus("Session ended");
      setRoomId(null);
      setMessages([]);
      setTimeout(() => {
        setView("home");
      }, 800);
    });

    socket.on("disconnect", () => {
      setStatus("Disconnected");
      setSearching(false);
    });

    return () => {
      try {
        socket.disconnect();
        socket.off();
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autoscroll when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // small human-check generator
  function generateQuestion() {
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;
    setQuestion({ a, b });
  }
  useEffect(() => generateQuestion(), []);

  function verifyUser() {
    if (!user.name.trim() || !user.gender) {
      alert("Please enter your name and select gender");
      return;
    }
    if (parseInt(answer || "0", 10) !== question.a + question.b) {
      alert("Verification failed — try again");
      generateQuestion();
      setAnswer("");
      return;
    }
    setUser((u) => ({ ...u, verified: true }));
    setView("home");
  }

  function toggle(tag) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function addCustomInterest() {
    const trim = custom.trim();
    if (!trim) return;
    if (!selected.includes(trim)) setSelected((p) => [...p, trim]);
    setCustom("");
  }

  function start() {
    if (!user.verified) {
      alert("Please verify yourself first");
      return;
    }
    // connect socket and request match
    socket.connect();
    setSearching(true);
    setStatus("Connecting...");
    socket.emit("join_waitlist", { interests: selected, user });
  }

  function send() {
    const txt = (inputRef.current?.value || "").trim();
    if (!txt || !roomId) return;
    socket.emit("send_message", { roomId, message: txt });
    setMessages((prev) => [...prev, { from: "me", text: txt }]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function endChat() {
    if (roomId) socket.emit("leave_chat", { roomId });
    setSearching(false);
  }

  function skipChat() {
    if (!roomId) return;
    socket.emit("skip_chat", { roomId });
    setMessages([]);
    setSearching(true);
    setStatus("Searching for next partner...");
  }

  return (
    <div className="app">
      <div className="card">
        <header className="nav">
          <div className="logo">ChatMitra</div>
          <div className="badge">{userCount} online</div>
        </header>

        {view === "setup" && (
          <div className="setup-card">
            <h1>Welcome to ChatMitra</h1>
            <p className="sub">Before you start, please verify you’re human</p>

            <label className="field">
              <span className="label">Display name</span>
              <input
                className="text"
                placeholder="Enter display name"
                value={user.name}
                onChange={(e) => setUser((u) => ({ ...u, name: e.target.value }))}
              />
            </label>

            <label className="field">
              <span className="label">Gender</span>
              <div className="gender-row">
                {["Male", "Female", "Other"].map((g) => (
                  <label key={g} className="radio">
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={user.gender === g}
                      onChange={(e) => setUser((u) => ({ ...u, gender: e.target.value }))}
                    />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </label>

            <label className="field">
              <span className="label">Are you human? Solve</span>
              <div className="verify-row">
                <div className="question">{question.a} + {question.b} =</div>
                <input
                  className="text small"
                  placeholder="Answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <button className="btn primary" onClick={verifyUser}>Verify & Continue</button>
              </div>
            </label>

            <div className="footer-note">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</div>
          </div>
        )}

        {view === "home" && (
          <div className="home-card">
            <div className="home-head">
              <div className="hello">Hello, <strong>{user.name}</strong></div>
              <div className="sub-muted">Select interests to match with similar people</div>
            </div>

            <div className="tags-row">
              {defaultTags.map((t) => (
                <button key={t} className={`tag ${selected.includes(t) ? "active" : ""}`} onClick={() => toggle(t)}>{t}</button>
              ))}
              {selected.filter(t => !defaultTags.includes(t)).map((t) => (
                <button key={t} className="tag active" onClick={() => toggle(t)}>{t}</button>
              ))}
            </div>

            <div className="add-row">
              <input className="text" placeholder="Add custom interest..." value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button className="btn" onClick={addCustomInterest}>Add</button>
            </div>

            <div className="start-row">
              <button className="btn primary big" onClick={start}>Start Chat</button>
              <div className="sub-muted">Matching by shared interests — fallback to random if no match</div>
            </div>
            <div className="footer-note">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</div>
          </div>
        )}

        {view === "chat" && (
          <div className="chat-card">
            <div className="chat-top">
              <div className="chat-status">{status}</div>
              <div className="chat-actions">
                <button className="btn small ghost" onClick={skipChat}>Skip</button>
                <button className="btn small" onClick={endChat}>End</button>
              </div>
            </div>

            <div className={`searching ${searching ? "visible" : ""}`}>
              <div className="dot" /><div className="dot" /><div className="dot" />
              <div className="search-text">Searching for a partner...</div>
            </div>

            <div className="messages" ref={msgBoxRef}>
              {messages.map((m, i) => (
                <div key={i} className={m.from === "me" ? "msg me" : "msg them"}>
                  {m.text}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="composer">
              <input ref={inputRef} className="text" placeholder="Type your message..." onKeyDown={(e) => e.key === "Enter" && send()} />
              <button className="btn primary" onClick={send}>Send</button>
            </div>
          </div>
        )}

        {/* footer outside individual cards */}
      </div>
    </div>
  );
}
