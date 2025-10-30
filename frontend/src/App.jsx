import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
let socket;

export default function App() {
  const [view, setView] = useState(() => localStorage.getItem("view") || "setup");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : { name: "", gender: "", verified: false };
  });
  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [roomId, setRoomId] = useState(null);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const inputRef = useRef();
  const msgBoxRef = useRef();

  const defaultTags = ["Travel", "Food", "Music", "Friends"];
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState("");

  // Generate human test
  const generateQuestion = () => {
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;
    setQuestion({ a, b });
  };

  useEffect(() => generateQuestion(), []);

  useEffect(() => {
    socket = io(SOCKET_URL, { autoConnect: false });

    socket.on("connect", () => setStatus("Connected to server"));
    socket.on("waiting", () => setStatus("Searching for partner..."));
    socket.on("user_count", (count) => setUserCount(count));

    socket.on("match_found", (data) => {
      setRoomId(data.roomId);
      setPartner(data.partner);
      setStatus(
        `Matched with ${data.partner.name} (${data.partner.gender}) — Shared: ${
          data.partner.shared.join(", ") || "none"
        }`
      );
      setMessages([]);
      setView("chat");
      localStorage.setItem("view", "chat");
    });

    socket.on("receive_message", (m) => {
      setMessages((prev) => [...prev, { from: "them", text: m.text }]);
      setTimeout(() => {
        msgBoxRef.current?.scrollTo(0, msgBoxRef.current.scrollHeight);
      }, 50);
    });

    socket.on("chat_ended", () => {
      setStatus("Partner disconnected or chat ended");
      setPartner(null);
      setRoomId(null);
      setTimeout(() => setView("home"), 1200);
    });

    socket.on("disconnect", () => setStatus("Disconnected"));
    return () => {
      try {
        socket.disconnect();
        socket.off();
      } catch {}
    };
  }, []);

  function verifyUser() {
    if (!user.name || !user.gender) return alert("Please enter name & gender");
    if (parseInt(answer) !== question.a + question.b) {
      alert("Verification failed, try again.");
      generateQuestion();
      setAnswer("");
      return;
    }
    const verifiedUser = { ...user, verified: true };
    setUser(verifiedUser);
    localStorage.setItem("user", JSON.stringify(verifiedUser));
    setView("home");
    localStorage.setItem("view", "home");
  }

  function toggle(tag) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function addCustomInterest() {
    const trimmed = custom.trim();
    if (trimmed && !selected.includes(trimmed)) setSelected([...selected, trimmed]);
    setCustom("");
  }

  function startChat() {
    if (!user.verified) return alert("Please verify first.");
    socket.connect();
    socket.emit("join_waitlist", { interests: selected, user });
    setStatus("Searching for partner...");
  }

  function skipChat() {
    if (!roomId) return;
    socket.emit("skip_chat", { roomId });
    setMessages([]);
    setPartner(null);
    setRoomId(null);
    setStatus("Searching for next partner...");
  }

  function endChat() {
    if (roomId) socket.emit("leave_chat", { roomId });
    setMessages([]);
    setPartner(null);
    setRoomId(null);
    setStatus("Chat ended");
    setTimeout(() => setView("home"), 1000);
  }

  function send() {
    const txt = inputRef.current.value.trim();
    if (!txt || !roomId) return;
    socket.emit("send_message", { roomId, message: txt });
    setMessages((prev) => [...prev, { from: "me", text: txt }]);
    inputRef.current.value = "";
    msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
  }

  return (
    <div className="app">
      <div className="card">
        <header className="nav">
          <div className="logo">ChatMitra</div>
          <div className="badge">{userCount} online</div>
        </header>

        {/* STEP 1 - SETUP */}
        {view === "setup" && (
          <div className="setup">
            <h2>Welcome to ChatMitra</h2>
            <p>Please verify yourself to continue.</p>

            <input
              type="text"
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
                    onChange={(e) => setUser({ ...user, gender: e.target.value })}
                  />
                  {g}
                </label>
              ))}
            </div>

            <div className="verify">
              <p>
                Are you human? What is {question.a} + {question.b} ?
              </p>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter answer"
              />
              <button onClick={verifyUser}>Verify & Continue</button>
            </div>
          </div>
        )}

        {/* STEP 2 - HOME */}
        {view === "home" && (
          <div className="home">
            <h1>Hello, {user.name} 👋</h1>
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
                  <button key={t} className="tag active" onClick={() => toggle(t)}>
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
              <div>
                <button className="skip" onClick={skipChat}>
                  Skip
                </button>
                <button className="end" onClick={endChat}>
                  End Chat
                </button>
              </div>
            </div>

            <div className="messages" id="msgbox" ref={msgBoxRef}>
              {messages.map((m, i) => (
                <div key={i} className={m.from === "me" ? "msg me" : "msg them"}>
                  {m.text}
                </div>
              ))}
            </div>

            <div className="composer">
              <input
                ref={inputRef}
                placeholder="Type your message..."
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button onClick={send}>Send</button>
            </div>
          </div>
        )}

        <footer className="foot">© {new Date().getFullYear()} ChatMitra</footer>
      </div>
    </div>
  );
}
