import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
let socket;

export default function App() {
  const [view, setView] = useState("setup");
  const [user, setUser] = useState({ name: "", gender: "", verified: false });
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [partner, setPartner] = useState(null);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef();
  const msgBoxRef = useRef();

  const defaultTags = ["Travel", "Food", "Music", "Friends"];

  useEffect(() => {
    socket = io(SOCKET_URL, { autoConnect: false });

    socket.on("connect", () => setStatus("Connected"));
    socket.on("waiting", () => {
      setStatus("Searching for a partner...");
      setSearching(true);
    });

    socket.on("match_found", (data) => {
      setRoomId(data.roomId);
      setPartner(data.partner);
      setSearching(false);
      setStatus(
        `Matched with ${data.partner.name} (${data.partner.gender}) — Shared: ${
          data.partner.shared.join(", ") || "none"
        }`
      );
      setMessages([]);
      setView("chat");
    });

    socket.on("receive_message", (m) => {
      setMessages((prev) => [...prev, { from: "them", text: m.text }]);
    });

    socket.on("chat_ended", () => {
      setRoomId(null);
      setMessages([]);
      setPartner(null);
      setStatus("Chat ended.");
      setView("home");
    });

    socket.on("partner_disconnected", () => {
      setStatus("Your partner disconnected.");
      setPartner(null);
      setRoomId(null);
      setSearching(false);
    });

    return () => {
      socket.disconnect();
      socket.off();
    };
  }, []);

  // simple verification
  const generateQuestion = () => {
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;
    setQuestion({ a, b });
  };
  useEffect(() => generateQuestion(), []);

  const verifyUser = () => {
    if (!user.name || !user.gender) return alert("Enter name and select gender");
    if (parseInt(answer) !== question.a + question.b) {
      alert("Wrong answer, try again");
      generateQuestion();
      setAnswer("");
      return;
    }
    setUser({ ...user, verified: true });
    setView("home");
  };

  const toggle = (tag) =>
    setSelected((p) =>
      p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]
    );

  const addCustomInterest = () => {
    const t = custom.trim();
    if (t && !selected.includes(t)) setSelected((p) => [...p, t]);
    setCustom("");
  };

  const startChat = () => {
    socket.connect();
    socket.emit("join_waitlist", { interests: selected, user });
  };

  const send = () => {
    const txt = inputRef.current.value.trim();
    if (!txt || !roomId) return;
    socket.emit("send_message", { roomId, message: txt });
    setMessages((p) => [...p, { from: "me", text: txt }]);
    inputRef.current.value = "";
    msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
  };

  const skipChat = () => {
    if (roomId) socket.emit("skip_chat", { roomId });
    setPartner(null);
    setMessages([]);
    setStatus("Searching for a partner...");
  };

  const goHome = () => {
    if (roomId) socket.emit("leave_chat", { roomId });
    setPartner(null);
    setMessages([]);
    setView("home");
  };

  return (
    <div className="app">
      <div className="card">
        <header className="nav">
          <div className="logo" onClick={goHome}>
            ChatMitra
          </div>
        </header>

        {/* STEP 1 - VERIFY */}
        {view === "setup" && (
          <div className="setup">
            <h2>Welcome to ChatMitra</h2>
            <p>Please verify yourself to continue.</p>
            <input
              placeholder="Enter your name"
              value={user.name}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
            />
            <div className="gender-select">
              {["Male", "Female", "Other"].map((g) => (
                <label key={g}>
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    checked={user.gender === g}
                    onChange={(e) =>
                      setUser({ ...user, gender: e.target.value })
                    }
                  />
                  {g}
                </label>
              ))}
            </div>
            <p>
              Are you human? Solve {question.a} + {question.b} = ?
            </p>
            <input
              placeholder="Enter answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button onClick={verifyUser}>Verify & Continue</button>
          </div>
        )}

        {/* STEP 2 - HOME */}
        {view === "home" && (
          <div className="home">
            <h1>
              Hello, {user.name} <span>👋</span>
            </h1>
            <p>Select your interests to find a match.</p>
            <div className="tags">
              {defaultTags.map((t) => (
                <button
                  key={t}
                  className={selected.includes(t) ? "tag active" : "tag"}
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
                placeholder="Add custom interest..."
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <button onClick={addCustomInterest}>Add</button>
            </div>
            <button className="start" onClick={startChat}>
              Start Chat
            </button>
          </div>
        )}

        {/* STEP 3 - CHAT */}
        {view === "chat" && (
          <div className="chat">
            <div className="chat-top">
              <div>{status}</div>
              <button onClick={skipChat}>Skip</button>
            </div>
            <div className="messages" ref={msgBoxRef}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.from === "me" ? "msg me" : "msg them"}
                >
                  {m.text}
                </div>
              ))}
            </div>
            <div className="composer">
              <input
                ref={inputRef}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === "Enter" && send()}
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
