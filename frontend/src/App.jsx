// frontend/src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./styles.css";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

export default function App() {
  const [view, setView] = useState(() => localStorage.getItem("cm_view") || "setup"); // setup | home | chat
  const [user, setUser] = useState(() => {
    const s = localStorage.getItem("cm_user");
    return s ? JSON.parse(s) : { name: "", gender: "", verified: false };
  });
  const [tags, setTags] = useState(() => JSON.parse(localStorage.getItem("cm_tags") || "[]"));
  const [custom, setCustom] = useState("");
  const [question, setQuestion] = useState({});
  const [answer, setAnswer] = useState("");

  const [status, setStatus] = useState("Not connected");
  const [userCount, setUserCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [partner, setPartner] = useState(null);
  const [searching, setSearching] = useState(false);
  const [typing, setTyping] = useState(false);

  const socketRef = useRef(null);
  const inputRef = useRef(null);
  const msgBoxRef = useRef(null);

  const defaultTags = ["Travel", "Food", "Music", "Friends"];

  // small helper: persist user/tags/view
  useEffect(() => {
    localStorage.setItem("cm_user", JSON.stringify(user));
    localStorage.setItem("cm_tags", JSON.stringify(tags));
    localStorage.setItem("cm_view", view);
  }, [user, tags, view]);

  // generate human challenge
  useEffect(() => {
    const a = Math.floor(Math.random()*6)+1;
    const b = Math.floor(Math.random()*6)+1;
    setQuestion({ a,b });
  }, []);

  // init socket once
  useEffect(() => {
    if (socketRef.current) return;
    const s = io(SOCKET_URL, { autoConnect: false });
    socketRef.current = s;

    s.on("connect", () => setStatus("Connected"));
    s.on("disconnect", () => { setStatus("Disconnected"); setSearching(false); });

    s.on("user_count", (c) => setUserCount(c));
    s.on("waiting", () => { setSearching(true); setStatus("Searching..."); });
    s.on("match_found", (data) => {
      setRoomId(data.roomId);
      setPartner(data.partner || null);
      setStatus(`Matched with ${data.partner?.name || 'Anonymous'}`);
      setMessages([]);
      setSearching(false);
      setView("chat");
    });
    s.on("receive_message", (m) => {
      setMessages(prev => [...prev, { from: 'them', text: m.text }]);
      setTimeout(()=>msgBoxRef.current?.scrollTo(0, msgBoxRef.current.scrollHeight), 60);
    });
    s.on("user_typing", () => {
      setTyping(true);
      setTimeout(()=>setTyping(false), 1500);
    });
    s.on("chat_ended", () => {
      setStatus("Chat ended");
      setRoomId(null);
      setPartner(null);
      setMessages([]);
      setTimeout(()=>setView("home"), 700);
    });
    s.on("partner_disconnected", () => {
      setStatus("Partner disconnected, searching new...");
      setRoomId(null);
      setPartner(null);
      setMessages([]);
      s.emit("join_waitlist", { interests: tags, user, userId: JSON.parse(localStorage.getItem('cm_session')||'null')?.userId });
    });

    // try to restore session
    const stored = JSON.parse(localStorage.getItem("cm_session") || "null");
    if (stored && stored.userId) {
      s.connect();
      s.emit('restore_session', stored);
      s.on('session_restored', (data) => {
        setUser({...data, verified:true});
        setTags(data.interests || []);
        setView("home");
      });
    }

    return () => s.disconnect();
  }, []);

  // helper scroll
  useEffect(() => {
    if (msgBoxRef.current) msgBoxRef.current.scrollTop = msgBoxRef.current.scrollHeight;
  }, [messages]);

  // actions
  function verify() {
    if (!user.name.trim() || !user.gender) { alert('enter name/gender'); return; }
    if (parseInt(answer||'0',10) !== (question.a + question.b)) { alert('verify failed'); return; }
    const uuid = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const session = { userId: uuid };
    localStorage.setItem('cm_session', JSON.stringify(session));
    // set user verified and persist
    setUser(u => ({ ...u, verified: true }));
    setView('home');
  }

  function toggleTag(t) { setTags(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev, t]); }
  function addCustom() { const s = custom.trim(); if(!s) return; if(!tags.includes(s)) setTags(p=>[...p,s]); setCustom(''); }

  function startChat() {
    if (!user.verified) { alert('verify first'); return; }
    if (!socketRef.current.connected) socketRef.current.connect();
    setMessages([]); setSearching(true);
    const session = JSON.parse(localStorage.getItem('cm_session')||'null');
    socketRef.current.emit('join_waitlist', { interests: tags, user, userId: session?.userId });
  }

  function send() {
    const txt = inputRef.current?.value.trim();
    if(!txt || !roomId) return;
    socketRef.current.emit('send_message', { roomId, message: txt });
    setMessages(prev => [...prev, { from: 'me', text: txt }]);
    inputRef.current.value = '';
    setTimeout(()=>msgBoxRef.current?.scrollTo(0,msgBoxRef.current.scrollHeight),50);
  }

  function handleTyping() {
    if(roomId) socketRef.current.emit('typing', { roomId });
  }

  function skip() {
    if(roomId) socketRef.current.emit('skip_chat', { roomId });
    else {
      // not in room, rejoin waitlist
      socketRef.current.emit('join_waitlist', { interests: tags, user, userId: JSON.parse(localStorage.getItem('cm_session')||'null')?.userId });
      setSearching(true);
    }
    setMessages([]); setPartner(null); setRoomId(null);
  }

  function end() {
    if(roomId) socketRef.current.emit('leave_chat', { roomId });
    setMessages([]); setPartner(null); setRoomId(null); setSearching(false);
  }

  // UI
  return (
    <div className="cm-root">
      <div className="cm-card">
        <header className="cm-header">
          <div className="cm-logo">ChatMitra</div>
          <div className="cm-online">{userCount} online</div>
        </header>

        {/* setup */}
        {view==='setup' && (
          <div className="cm-body">
            <h2>Welcome</h2>
            <input className="cm-input" placeholder="Display name" value={user.name} onChange={e=>setUser({...user,name:e.target.value})} />
            <div className="cm-gender">
              {['Male','Female','Other'].map(g=>(
                <label key={g}><input type="radio" name="g" value={g} checked={user.gender===g} onChange={e=>setUser({...user,gender:e.target.value})} /> {g}</label>
              ))}
            </div>
            <div className="cm-verify">
              <div>Are you human? {question.a} + {question.b} =</div>
              <input className="cm-input small" value={answer} onChange={e=>setAnswer(e.target.value)} />
              <button className="cm-btn primary" onClick={verify}>Verify</button>
            </div>
          </div>
        )}

        {/* home */}
        {view==='home' && (
          <div className="cm-body">
            <h2>Hello, {user.name}</h2>
            <div className="cm-tags">
              {defaultTags.map(t=>(
                <button key={t} className={`tag ${tags.includes(t)?'active':''}`} onClick={()=>toggleTag(t)}>{t}</button>
              ))}
              {tags.filter(t=>!defaultTags.includes(t)).map(t=>(
                <button key={t} className="tag active" onClick={()=>toggleTag(t)}>{t}</button>
              ))}
            </div>
            <div className="cm-custom">
              <input className="cm-input" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Custom interest" />
              <button className="cm-btn" onClick={addCustom}>Add</button>
            </div>
            <button className="cm-btn primary big" onClick={startChat}>Start Chat</button>
          </div>
        )}

        {/* chat */}
        {view==='chat' && (
          <div className="cm-body chat">
            <div className="chat-top">
              <div>{status}{partner?.shared ? ` — Shared: ${partner.shared?.length ? partner.shared.join(', ') : 'none'}` : ''}</div>
              <div className="chat-controls">
                <button className="cm-btn" onClick={skip}>Skip</button>
                <button className="cm-btn ghost" onClick={end}>End</button>
              </div>
            </div>

            {searching && <div className="searching"><span className="dot"/><span className="dot"/><span className="dot"/> Searching for partner...</div>}

            <div className="messages" ref={msgBoxRef}>
              {messages.map((m,i)=>(
                <div key={i} className={`message ${m.from==='me'?'me':'them'}`}>{m.text}</div>
              ))}
              {typing && <div className="typing">Partner is typing...</div>}
            </div>

            <div className="composer">
              <input className="cm-input" ref={inputRef} placeholder="Type a message..." onKeyDown={e=>{ if(e.key==='Enter') send(); else handleTyping(); }} />
              <button className="cm-btn primary" onClick={send}>Send</button>
            </div>
          </div>
        )}

        <footer className="cm-footer">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</footer>
      </div>
    </div>
  );
}
