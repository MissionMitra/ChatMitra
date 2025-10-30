// frontend/src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./styles.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

export default function App() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem("cm_view") || "setup"); // setup | home | chat
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("cm_user");
    return raw ? JSON.parse(raw) : { name: "", gender: "", verified: false };
  });

  const [selected, setSelected] = useState(() => {
    const raw = localStorage.getItem("cm_tags");
    return raw ? JSON.parse(raw) : [];
  });
  const [custom, setCustom] = useState("");
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState("");

  const [status, setStatus] = useState("Not connected");
  const [userCount, setUserCount] = useState(0);
  const [roomId, setRoomId] = useState(null);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef();
  const msgBoxRef = useRef();

  const defaultTags = ["Travel", "Food", "Music", "Friends"];

  // ---------- small utilities ----------
  function persistState() {
    localStorage.setItem("cm_user", JSON.stringify(user));
    localStorage.setItem("cm_tags", JSON.stringify(selected));
    localStorage.setItem("cm_view", view);
  }

  useEffect(() => persistState(), [user, selected, view]);

  // ---------- generate easy human-check ----------
  useEffect(() => {
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;
    setQuestion({ a, b });
  }, []);

  // ---------- init socket only once ----------
  useEffect(() => {
    if (socketRef.current) return; // guard double init

    const s = io(SOCKET_URL, { autoConnect: false, transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("connect", () => {
      setConnected(true);
      setStatus("Connected to server");
      s.emit("ping_server"); // optional ping
    });

    s.on("disconnect", () => {
      setConnected(false);
      setStatus("Disconnected");
      setSearching(false);
    });

    s.on("user_count", (count) => setUserCount(count));

    s.on("waiting", () => {
      setSearching(true);
      setStatus("Searching for a partner...");
    });

    s.on("match_found", (data) => {
      // both sides receive this event
      setRoomId(data.roomId || null);
      setPartner(data.partner || null);
      setMessages([]);
      setSearching(false);
      setStatus(
        `Matched with ${data.partner?.name || "Anonymous"} (${data.partner?.gender || "Unknown"}) — Shared: ${
          (data.partner?.shared || []).length ? (data.partner.shared || []).join(", ") : "none"
        }`
      );
      setView("chat");
      localStorage.setItem("cm_view", "chat");
    });

    s.on("receive_message", (m) => {
      setMessages((prev) => [...prev, { from: "them", text: m.text }]);
    });

    s.on("chat_ended", () => {
      // partner or room ended
      setStatus("Chat ended — returning to home");
      setPartner(null);
      setRoomId(null);
      setMessages([]);
      setSearching(false);
      setTimeout(() => {
        setView("home");
        localStorage.setItem("cm_view", "home");
      }, 700);
    });

    s.on("partner_disconnected", () => {
      // partner disconnected unexpectedly; place user back to waiting automatically
      setStatus("Partner disconnected — searching new partner...");
      setPartner(null);
      setRoomId(null);
      setMessages([]);
      setSearching(true);
      // rejoin
      if (user.verified) {
        s.emit("join_waitlist", { interests: selected, user });
      }
    });

    return () => {
      try {
        s.disconnect();
        s.off();
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- auto-scroll messages ----------
  useEffect(() => {
    if (msgBoxRef.current) {
      msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
    }
  }, [messages]);

  // ---------- verification ----------
  function verifyUser() {
    if (!user.name.trim() || !user.gender) {
      alert("Please enter name and select gender");
      return;
    }
    if (parseInt(answer || "0", 10) !== question.a + question.b) {
      alert("Verification failed — try again");
      // regenerate
      const a = Math.floor(Math.random() * 5) + 1;
      const b = Math.floor(Math.random() * 5) + 1;
      setQuestion({ a, b });
      setAnswer("");
      return;
    }
    const u = { ...user, verified: true };
    setUser(u);
    localStorage.setItem("cm_user", JSON.stringify(u));
    setView("home");
    localStorage.setItem("cm_view", "home");
  }

  // ---------- tags ----------
  function toggleTag(t) {
    setSelected((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function addCustom() {
    const t = custom.trim();
    if (!t) return;
    if (!selected.includes(t)) setSelected((p) => [...p, t]);
    setCustom("");
  }

  // ---------- chat actions ----------
  function startChat() {
    if (!user.verified) {
      alert("Please verify first");
      return;
    }
    if (!socketRef.current) return;
    if (!socketRef.current.connected) socketRef.current.connect();
    setMessages([]);
    setSearching(true);
    setStatus("Searching for a partner...");
    socketRef.current.emit("join_waitlist", { interests: selected, user });
  }

  function sendMessage() {
    const txt = inputRef.current?.value.trim();
    if (!txt || !roomId) return;
    socketRef.current.emit("send_message", { roomId, message: txt });
    setMessages((prev) => [...prev, { from: "me", text: txt }]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function skipChat() {
    if (!roomId) {
      // if not in room just rejoin queue
      setStatus("Searching for a partner...");
      setSearching(true);
      socketRef.current.emit("join_waitlist", { interests: selected, user });
      return;
    }
    socketRef.current.emit("skip_chat", { roomId });
    setMessages([]);
    setPartner(null);
    setRoomId(null);
    setSearching(true);
    setStatus("Searching for next partner...");
  }

  function endChat() {
    if (roomId) socketRef.current.emit("leave_chat", { roomId });
    setMessages([]);
    setPartner(null);
    setRoomId(null);
    setStatus("Chat ended");
    setSearching(false);
    setTimeout(() => {
      setView("home");
      localStorage.setItem("cm_view", "home");
    }, 500);
  }

  // ---------- UI helpers ----------
  function tagButtonClass(t) {
    return selected.includes(t) ? "tag active" : "tag";
  }

  // ---------- render ----------
  return (
    <div className="cm-root">
      <div className="cm-background" />

      <div className="cm-container">
        <div className="card cm-card">
          <header className="cm-header">
            <div className="logo">ChatMitra</div>
            <div className="online-badge">{userCount} online</div>
          </header>

          {/* SETUP */}
          {view === "setup" && (
            <div className="cm-body">
              <h1 className="cm-title">Welcome to ChatMitra</h1>
              <p className="cm-sub">Please verify yourself to continue.</p>

              <input
                className="input"
                placeholder="Enter display name"
                value={user.name}
                onChange={(e) => setUser({ ...user, name: e.target.value })}
              />

              <div className="gender-row">
                <label><input type="radio" name="g" value="Male" checked={user.gender === "Male"} onChange={(e) => setUser({ ...user, gender: e.target.value })} /> Male</label>
                <label><input type="radio" name="g" value="Female" checked={user.gender === "Female"} onChange={(e) => setUser({ ...user, gender: e.target.value })} /> Female</label>
                <label><input type="radio" name="g" value="Other" checked={user.gender === "Other"} onChange={(e) => setUser({ ...user, gender: e.target.value })} /> Other</label>
              </div>

              <div className="verify-row">
                <label className="verify-label">Are you human? Solve</label>
                <div className="verify-challenge">{question.a} + {question.b} =</div>
                <input className="input small" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" />
                <button className="btn primary" onClick={verifyUser}>Verify & Continue</button>
              </div>
            </div>
          )}

          {/* HOME */}
          {view === "home" && (
            <div className="cm-body">
              <h1 className="cm-title">Hello, {user.name}</h1>
              <p className="cm-sub">Select your interests to find a match</p>

              <div className="tags-wrap">
                {defaultTags.map((t) => (
                  <button key={t} className={tagButtonClass(t)} onClick={() => toggleTag(t)}>{t}</button>
                ))}
                {selected.filter(t => !defaultTags.includes(t)).map(t => (
                  <button key={t} className="tag active" onClick={() => toggleTag(t)}>{t}</button>
                ))}
              </div>

              <div className="custom-row">
                <input className="input" placeholder="Add custom interest..." value={custom} onChange={(e) => setCustom(e.target.value)} />
                <button className="btn" onClick={addCustom}>Add</button>
              </div>

              <div className="start-row">
                <button className="btn big primary" onClick={startChat}>Start Chat</button>
              </div>
            </div>
          )}

          {/* CHAT */}
          {view === "chat" && (
            <div className="cm-body chat-body">
              <div className="chat-top">
                <div className="status-text">{status}</div>
                <div className="chat-controls">
                  <button className="btn ghost" onClick={skipChat}>Skip</button>
                  <button className="btn" onClick={endChat}>End</button>
                </div>
              </div>

              {/* searching indicator */}
              {searching && (
                <div className="searching">
                  <div className="dots"><span/><span/><span/></div>
                  <div className="search-text">Searching for a partner...</div>
                </div>
              )}

              <div className="messages" id="msgbox" ref={msgBoxRef}>
  {messages.map((m, i) => (
    <div
      key={i}
      className={`message ${m.from === 'me' ? 'me' : 'them'}`}
    >
      {m.text}
    </div>
  ))}
</div>


              <div className="composer">
                <input className="input" placeholder="Type your message..." ref={inputRef} onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
                <button className="btn primary" onClick={sendMessage}>Send</button>
              </div>
            </div>
          )}

          <footer className="cm-footer">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</footer>
        </div>
      </div>
    </div>
  );
}
