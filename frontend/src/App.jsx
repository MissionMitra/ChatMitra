import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";
let socket;

export default function App() {
  const [view, setView] = useState("setup"); // setup → home → chat
  const [user, setUser] = useState({ name: "", gender: "", verified: false });
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState("");

  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [roomId, setRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef();
  const msgBoxRef = useRef();

  const defaultTags = ["Travel", "Food", "Music", "Friends"];

  // === Socket Connection ===
  useEffect(() => {
    socket = io(SOCKET_URL, { autoConnect: false });

    socket.on("connect", () => setStatus("Connected ✅"));
    socket.on("waiting", () => {
      setStatus("Searching for a partner...");
      setSearching(true);
    });

    // ✅ Match Found
    socket.on("match_found", (data) => {
      setRoomId(data.roomId);
      const sharedText =
        data.shared && data.shared.length > 0
          ? data.shared.join(", ")
          : "none";
      setStatus(
        `Matched with ${data.partner.name} (${data.partner.gender}) — Shared: ${sharedText}`
      );
      setView("chat");
      setSearching(false);
    });

    socket.on("receive_message", (m) => {
      setMessages((prev) => [...prev, { from: "them", text: m.text }]);
    });

    socket.on("user_typing", () => {
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 1500);
    });

    socket.on("chat_ended", () => {
      setStatus("Partner left — finding new match...");
      setRoomId(null);
      setMessages([]);
      setSearching(true);
      socket.emit("join_waitlist", {
        interests: selected,
        user,
        userId: JSON.parse(localStorage.getItem("chatmitra_session"))?.userId,
      });
    });

    socket.on("user_count", (count) => setUserCount(count));
    socket.on("disconnect", () => setStatus("Disconnected ❌"));

    // ✅ Session restore
    const savedSession = JSON.parse(localStorage.getItem("chatmitra_session"));
    if (savedSession) {
      socket.connect();
      socket.emit("restore_session", savedSession);
    }

    socket.on("session_restored", (data) => {
      setUser({ ...data, verified: true });
      setSelected(data.interests || []);
      setView("home");
    });

    socket.on("no_session", () => console.log("No session found"));

    return () => socket.disconnect();
  }, []);

  // === Human verification ===
  function generateQuestion() {
    const a = Math.floor(Math.random() * 5) + 1;
    const b = Math.floor(Math.random() * 5) + 1;
    setQuestion({ a, b });
  }

  useEffect(() => generateQuestion(), []);

  function verifyUser() {
    if (!user.name || !user.gender) {
      alert("Please enter your name and select gender");
      return;
    }
    if (parseInt(answer) !== question.a + question.b) {
      alert("Verification failed. Try again.");
      generateQuestion();
      setAnswer("");
      return;
    }

    const newSession = { userId: crypto.randomUUID() };
    localStorage.setItem("chatmitra_session", JSON.stringify(newSession));
    setUser({ ...user, verified: true });
    setView("home");
  }

  // === Interest management ===
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
    setCustom("");
  }

  // === Start Chat ===
  function start() {
    const session = JSON.parse(localStorage.getItem("chatmitra_session"));
    socket.connect();
    socket.emit("join_waitlist", {
      interests: selected,
      user,
      userId: session?.userId,
    });
    setSearching(true);
    setStatus("Searching for a partner...");
  }

  // === Send Message ===
  function send() {
    const txt = inputRef.current.value.trim();
    if (!txt || !roomId) return;
    socket.emit("send_message", { roomId, message: txt });
    setMessages((prev) => [...prev, { from: "me", text: txt }]);
    inputRef.current.value = "";
    msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
  }

  // === Typing ===
  function handleTyping() {
    if (roomId) socket.emit("typing", { roomId });
  }

  // === End & Skip Chat ===
  function endChat() {
    if (roomId) socket.emit("leave_chat", { roomId });
    setRoomId(null);
    setMessages([]);
    setSearching(true);
  }

  function skipChat() {
    if (roomId) socket.emit("skip_chat", { roomId });
    setRoomId(null);
    setMessages([]);
    setSearching(true);
  }

  return (
    <div
      className="min-h-screen flex justify-center items-center bg-gradient-to-b from-[#07121e] to-[#0c1d2f] text-white px-4"
      style={{ fontFamily: "Poppins, sans-serif" }}
    >
      <div className="w-full max-w-md bg-[#0b1623] rounded-2xl shadow-2xl overflow-hidden">
        <header className="flex justify-between items-center bg-[#112233] px-5 py-3">
          <h2 className="text-lg font-semibold">ChatMitra</h2>
          <span className="text-sm text-gray-400">{userCount} online</span>
        </header>

        {/* === Setup Screen === */}
        {view === "setup" && (
          <div className="p-6 text-center space-y-4">
            <h1 className="text-2xl font-bold">Welcome to ChatMitra</h1>
            <p>Please verify yourself to continue.</p>

            <input
              type="text"
              placeholder="Enter your name"
              className="w-full p-2 rounded bg-[#132234] border border-gray-600 focus:outline-none"
              value={user.name}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
            />

            <div className="flex justify-center gap-4">
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
                  />{" "}
                  {g}
                </label>
              ))}
            </div>

            <p>
              Are you human? Solve: {question.a} + {question.b} = ?
            </p>
            <div className="flex gap-2 justify-center">
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Answer"
                className="p-2 rounded bg-[#132234] w-20 text-center"
              />
              <button
                onClick={verifyUser}
                className="bg-[#00bcd4] hover:bg-[#0097a7] px-3 py-2 rounded text-black font-medium"
              >
                Verify & Continue
              </button>
            </div>
          </div>
        )}

        {/* === Interest Selection === */}
        {view === "home" && (
          <div className="p-6 text-center space-y-4">
            <h1 className="text-2xl font-semibold">
              Hello, {user.name} 👋
            </h1>
            <p className="text-gray-300 text-sm">
              Select your interests to find a match.
            </p>

            <div className="flex flex-wrap justify-center gap-2">
              {defaultTags.map((t) => (
                <button
                  key={t}
                  className={`px-3 py-1 rounded-full ${
                    selected.includes(t)
                      ? "bg-[#00bcd4] text-black"
                      : "bg-[#132234] text-gray-300"
                  }`}
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
                    className="px-3 py-1 rounded-full bg-[#00bcd4] text-black"
                    onClick={() => toggle(t)}
                  >
                    {t}
                  </button>
                ))}
            </div>

            <div className="flex gap-2 justify-center">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Add custom interest..."
                className="p-2 rounded bg-[#132234] w-2/3"
              />
              <button
                onClick={addCustomInterest}
                className="bg-[#00bcd4] px-3 py-2 rounded text-black font-medium"
              >
                Add
              </button>
            </div>

            <button
              onClick={start}
              className="bg-[#00bcd4] hover:bg-[#0097a7] px-5 py-2 rounded text-black font-semibold"
            >
              Start Chat
            </button>
          </div>
        )}

        {/* === Chat Screen === */}
        {view === "chat" && (
          <div className="p-4 flex flex-col h-[70vh]">
            <div className="flex justify-between items-center text-sm mb-3">
              <div>{status}</div>
              <div className="flex gap-2">
                <button
                  onClick={skipChat}
                  className="bg-[#00bcd4] text-black px-3 py-1 rounded"
                >
                  Skip
                </button>
                <button
                  onClick={endChat}
                  className="bg-red-500 text-white px-3 py-1 rounded"
                >
                  End
                </button>
              </div>
            </div>

            <div
              className="flex-1 overflow-y-auto bg-[#091625] rounded-xl p-3 space-y-2"
              ref={msgBoxRef}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                    m.from === "me"
                      ? "bg-[#00bcd4] text-black self-end ml-auto"
                      : "bg-[#132234] text-white"
                  }`}
                >
                  {m.text}
                </div>
              ))}

              {isTyping && (
                <div className="text-xs text-gray-400 italic">User is typing...</div>
              )}
            </div>

            {searching ? (
              <div className="text-center py-4 text-sm text-gray-400 animate-pulse">
                Searching for a partner...
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <input
                  ref={inputRef}
                  placeholder="Type your message..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                    else handleTyping();
                  }}
                  className="flex-1 p-2 rounded bg-[#132234] text-white"
                />
                <button
                  onClick={send}
                  className="bg-[#00bcd4] px-4 py-2 rounded text-black font-semibold"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}

        <footer className="text-center text-xs text-gray-400 py-2">
          © {new Date().getFullYear()} ChatMitra — Ephemeral chats
        </footer>
      </div>
    </div>
  );
}
