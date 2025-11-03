// frontend/src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./styles.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

export default function App() {
  const socketRef = useRef(null);
  const [view, setView] = useState(() => localStorage.getItem("cm_view") || "setup");
  const [user, setUser] = useState(() => {
    const s = localStorage.getItem("cm_user");
    return s ? JSON.parse(s) : { name: "", gender: "", verified: false };
  });
  const [tags, setTags] = useState(() => JSON.parse(localStorage.getItem("cm_tags") || "[]"));
  const [custom, setCustom] = useState("");
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState("");

  const [status, setStatus] = useState("Not connected");
  const [messages, setMessages] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [partner, setPartner] = useState(null);
  const [searching, setSearching] = useState(false);
  const [typing, setTyping] = useState(false);

  const inputRef = useRef(null);
  const msgBoxRef = useRef(null);

  const defaultTags = ["Travel", "Food", "Music", "Friends"];

  useEffect(() => {
    localStorage.setItem("cm_user", JSON.stringify(user));
    localStorage.setItem("cm_tags", JSON.stringify(tags));
    localStorage.setItem("cm_view", view);
  }, [user, tags, view]);

  useEffect(() => {
    const a = Math.floor(Math.random() * 6) + 1;
    const b = Math.floor(Math.random() * 6) + 1;
    setQuestion({ a, b });
  }, []);

  useEffect(() => {
    if (socketRef.current) return;
    const s = io(SOCKET_URL, { autoConnect: false, transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("connect", () => setStatus("Connected"));
    s.on("disconnect", () => { setStatus("Disconnected"); setSearching(false); });

    s.on("waiting", () => {
      setSearching(true);
      setStatus("Searching for a partner...");
    });

    s.on("match_found", (data) => {
      setRoomId(data.roomId);
      setPartner({ ...data.partner, shared: data.shared || [] });
      setMessages([]);
      setSearching(false);
      const sharedText = (data.shared && data.shared.length) ? data.shared.join(", ") : "none";
      setStatus(`Matched with ${data.partner?.name || "Anonymous"} — Shared: ${sharedText}`);
      setView("chat");
    });

    s.on("receive_message", (m) => {
      setMessages(prev => [...prev, { from: "them", text: m.text }]);
      setTimeout(() => msgBoxRef.current?.scrollTo(0, msgBoxRef.current.scrollHeight), 60);
    });

    s.on("user_typing", () => {
      setTyping(true);
      setTimeout(() => setTyping(false), 1400);
    });

    s.on("chat_ended", () => {
      setStatus("Chat ended — returning to home");
      setPartner(null);
      setRoomId(null);
      setMessages([]);
      setSearching(false);
      setTimeout(() => setView("home"), 700);
    });

    s.on("partner_disconnected", () => {
      setStatus("Partner disconnected — finding new match...");
      setPartner(null);
      setRoomId(null);
      setMessages([]);
      s.emit("join_waitlist", { interests: tags, user, userId: JSON.parse(localStorage.getItem("cm_session")||"null")?.userId });
    });

    const stored = JSON.parse(localStorage.getItem("cm_session") || "null");
    if (stored && stored.userId) {
      s.connect();
      s.emit("restore_session", stored);
      s.on("session_restored", (data) => {
        setUser({ ...data, verified: true });
        setTags(data.interests || []);
        setView("home");
      });
    }

    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (msgBoxRef.current) msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
  }, [messages]);

  function verify() {
    if (!user.name.trim() || !user.gender) { alert("Enter name & gender"); return; }
    if (parseInt(answer || "0", 10) !== (question.a + question.b)) { alert("Verification failed"); return; }
    const uuid = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    localStorage.setItem("cm_session", JSON.stringify({ userId: uuid }));
    setUser(u => ({ ...u, verified: true }));
    setView("home");
  }

  function toggleTag(t) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function addCustom() { const s = custom.trim(); if (!s) return; if (!tags.includes(s)) setTags(p => [...p, s]); setCustom(""); }

  function start() {
    if (!user.verified) { alert("Verify first"); return; }
    const session = JSON.parse(localStorage.getItem("cm_session") || "null");
    if (!socketRef.current.connected) socketRef.current.connect();
    setSearching(true);
    setStatus("Searching for a partner...");
    socketRef.current.emit("join_waitlist", { interests: tags, user, userId: session?.userId });
  }

  function send() {
    const txt = inputRef.current?.value.trim();
    if (!txt || !roomId) return;
    socketRef.current.emit("send_message", { roomId, message: txt });
    setMessages(prev => [...prev, { from: "me", text: txt }]);
    if (inputRef.current) inputRef.current.value = "";
    setTimeout(() => msgBoxRef.current?.scrollTo(0, msgBoxRef.current.scrollHeight), 60);
  }

  function onTyping() {
    if (roomId) socketRef.current.emit("typing", { roomId });
  }

  function skip() {
    if (roomId) socketRef.current.emit("skip_chat", { roomId });
    else socketRef.current.emit("join_waitlist", { interests: tags, user, userId: JSON.parse(localStorage.getItem("cm_session")||"null")?.userId });
    setMessages([]); setPartner(null); setRoomId(null); setSearching(true);
  }

  // 🔹 NEW: Go home when clicking ChatMitra label
  function goHome() {
    if (roomId) socketRef.current.emit("leave_chat", { roomId });
    setRoomId(null);
    setPartner(null);
    setMessages([]);
    setView("home");
  }

  return (
    <div className="cm-root">
      <div className="cm-card">
        <header className="cm-header">
          {/* 🔹 clickable ChatMitra label */}
          <div className="cm-logo" style={{cursor:'pointer'}} onClick={goHome}>ChatMitra</div>
        </header>

        {/* setup */}
        {view === "setup" && (
          <div className="cm-body">
            <h2>Welcome to ChatMitra</h2>
            <input className="cm-input" placeholder="Display name" value={user.name} onChange={e => setUser({...user, name: e.target.value})} />
            <div className="cm-gender">
              {["Male","Female","Other"].map(g => (
                <label key={g}><input type="radio" name="g" value={g} checked={user.gender===g} onChange={e=>setUser({...user, gender:e.target.value})} /> {g}</label>
              ))}
            </div>
            <div className="cm-verify">
              <div>Are you human? {question.a} + {question.b} =</div>
              <input className="cm-input small" value={answer} onChange={e => setAnswer(e.target.value)} />
              <button className="cm-btn primary" onClick={verify}>Verify</button>
            </div>
          </div>
        )}

        {/* home */}
        {view === "home" && (
          <div className="cm-body">
            <h2>Hello, {user.name}</h2>
            <div className="cm-tags">
              {defaultTags.map(t => (
                <button key={t} className={`tag ${tags.includes(t)?'active':''}`} onClick={() => toggleTag(t)}>{t}</button>
              ))}
              {tags.filter(t=>!defaultTags.includes(t)).map(t => (
                <button key={t} className="tag active" onClick={() => toggleTag(t)}>{t}</button>
              ))}
            </div>
            <div className="cm-custom">
              <input className="cm-input" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Custom interest" />
              <button className="cm-btn" onClick={addCustom}>Add</button>
            </div>
            <button className="cm-btn primary big" onClick={start}>Start Chat</button>
          </div>
        )}

        {/* chat */}
        {view === "chat" && (
          <div className="cm-body chat">
            <div className="chat-top">
              <div>{status}{partner?.shared ? ` — Shared: ${partner.shared.length ? partner.shared.join(', ') : 'none'}` : ''}</div>
              <div className="chat-controls">
                <button className="cm-btn" onClick={skip}>Skip</button>
                {/* 🔹 End button removed */}
              </div>
            </div>

            {searching && (
              <div className="searching"><span className="dot"/><span className="dot"/><span className="dot"/> Searching for partner...</div>
            )}

            <div className="messages" ref={msgBoxRef}>
              {messages.map((m,i) => (
                <div key={i} className={`message ${m.from==='me'?'me':'them'}`}>{m.text}</div>
              ))}
              {typing && <div className="typing">Partner is typing...</div>}
            </div>

            <div className="composer">
              <input className="cm-input" ref={inputRef} placeholder="Type a message..." onKeyDown={e => { if (e.key==='Enter') send(); else onTyping(); }} />
              <button className="cm-btn primary" onClick={send}>Send</button>
            </div>
          </div>
        )}

        <footer className="cm-footer">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</footer>
      </div>
    </div>
  );
}
