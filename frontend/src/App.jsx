// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

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

  const socketRef = useRef(null);
  const inputRef = useRef();
  const msgBoxRef = useRef();
  const endRef = useRef();

  const defaultTags = ["Travel", "Food", "Music", "Friends"];

  // --- session persistence: load saved user and selected tags
  useEffect(() => {
    try {
      const savedUser = sessionStorage.getItem("chatmitra_user");
      const savedSelected = sessionStorage.getItem("chatmitra_selected");
      const savedView = sessionStorage.getItem("chatmitra_view");
      if (savedUser) setUser(JSON.parse(savedUser));
      if (savedSelected) setSelected(JSON.parse(savedSelected));
      if (savedView) setView(savedView);
    } catch (e) {}
  }, []);

  // save user + selected to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("chatmitra_user", JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    sessionStorage.setItem("chatmitra_selected", JSON.stringify(selected));
  }, [selected]);

  useEffect(() => {
    sessionStorage.setItem("chatmitra_view", view);
  }, [view]);

  // socket initialization and listeners
  useEffect(() => {
    const sock = io(SOCKET_URL, { autoConnect: false });
    socketRef.current = sock;

    sock.on("connect", () => {
      setStatus("Connected to server");
      // If user was previously verified and not in chat, auto rejoin waitlist
      const wasVerified = JSON.parse(sessionStorage.getItem("chatmitra_user") || "null");
      if (wasVerified && wasVerified.verified) {
        // rejoin automatically so refresh doesn't drop user to welcome
        // Only rejoin if not currently in a chat
        const curView = sessionStorage.getItem("chatmitra_view");
        if (curView !== "chat") {
          setStatus("Re-connecting to match...");
          setSearching(true);
          sock.emit("join_waitlist", { interests: selected, user: wasVerified });
        }
      }
    });

    sock.on("waiting", () => {
      setSearching(true);
      setStatus("Searching for a partner...");
    });

    sock.on("user_count", (count) => setUserCount(count));

    sock.on("match_found", (data) => {
      setSearching(false);
      setRoomId(data.roomId || null);
      const partnerName = data.partner?.name || "Anonymous";
      const partnerGender = data.partner?.gender || "Unknown";
      const shared = (data.partner?.shared || []).join(", ") || "none";
      setStatus(`Matched with ${partnerName} (${partnerGender}) — Shared: ${shared}`);
      setMessages([]);
      setView("chat");
      sessionStorage.setItem("chatmitra_view", "chat");
    });

    sock.on("receive_message", (m) => {
      setMessages((prev) => [...prev, { from: "them", text: m.text }]);
    });

    sock.on("chat_ended", () => {
      setStatus("Session ended");
      setRoomId(null);
      setMessages([]);
      setView("home");
      setSearching(false);
      // after chat ended, automatically rejoin waitlist if desired:
      // sock.emit("join_waitlist", { interests: selected, user });
    });

    sock.on("disconnect", () => {
      setStatus("Disconnected");
      setSearching(false);
    });

    return () => {
      try {
        sock.disconnect();
        sock.off();
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // autoscroll messages when new message arrives
  useEffect(() => {
    if (msgBoxRef.current) {
      msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // Small human-check generator
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
    const t = custom.trim();
    if (!t) return;
    if (!selected.includes(t)) setSelected((p) => [...p, t]);
    setCustom("");
  }

  function start() {
    if (!user.verified) {
      alert("Please verify yourself first");
      return;
    }
    const sock = socketRef.current;
    if (!sock) return;
    sock.connect();
    setSearching(true);
    setStatus("Connecting...");
    sock.emit("join_waitlist", { interests: selected, user });
  }

  function send() {
    const txt = (inputRef.current?.value || "").trim();
    if (!txt || !roomId) return;
    const sock = socketRef.current;
    sock.emit("send_message", { roomId, message: txt });
    setMessages((prev) => [...prev, { from: "me", text: txt }]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function endChat() {
    const sock = socketRef.current;
    if (roomId && sock) {
      sock.emit("leave_chat", { roomId });
      setRoomId(null);
      setSearching(false);
    }
    setView("home");
  }

  function skipChat() {
    const sock = socketRef.current;
    if (roomId && sock) {
      sock.emit("skip_chat", { roomId });
      setMessages([]);
      setSearching(true);
      setStatus("Searching for next partner...");
      setRoomId(null);
    }
  }

  return (
    <div className="app">
      <div className="card">
        <header className="nav">
          <div className="logo">ChatMitra</div>
          <div className="badge">{userCount} online</div>
        </header>

        {/* Setup */}
        {view === "setup" && (
          <div className="setup-card">
            <h1>Welcome to ChatMitra</h1>
            <p className="sub">Before you start, verify you’re human</p>

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
                    <input type="radio" name="gender" value={g} checked={user.gender === g} onChange={(e) => setUser((u) => ({ ...u, gender: e.target.value }))} />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </label>

            <label className="field">
              <span className="label">Are you human? Solve</span>
              <div className="verify-row">
                <div className="question">{question.a} + {question.b} =</div>
                <input className="text small" placeholder="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
                <button className="btn primary" onClick={verifyUser}>Verify & Continue</button>
              </div>
            </label>

            <div className="footer-note">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</div>
          </div>
        )}

        {/* Home */}
        {view === "home" && (
          <div className="home-card">
            <div className="home-head">
              <div className="hello">Hello, <strong>{user.name}</strong></div>
              <div className="sub-muted">Select interests to match</div>
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
              <div className="sub-muted">Matches by shared interests — fallback to random if none</div>
            </div>
            <div className="footer-note">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</div>
          </div>
        )}

        {/* Chat */}
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
                <div key={i} className={m.from === "me" ? "msg me" : "msg them"}>{m.text}</div>
              ))}
            </div>

            <div className="composer">
              <input ref={inputRef} className="text" placeholder="Type your message..." onKeyDown={(e) => e.key === "Enter" && send()} />
              <button className="btn primary" onClick={send}>Send</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
