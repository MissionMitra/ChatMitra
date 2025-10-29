import React, {useState, useEffect, useRef} from 'react'
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'

let socket

export default function App(){
  const [view, setView] = useState('home')
  const [selected, setSelected] = useState(['Music','Tech'])
  const [custom, setCustom] = useState('')
  const [status, setStatus] = useState('Not connected')
  const [roomId, setRoomId] = useState(null)
  const [messages, setMessages] = useState([])
  const inputRef = useRef()

  useEffect(()=>{
    socket = io(SOCKET_URL, { autoConnect: false })

    socket.on('connect', ()=> setStatus('Connected to server'))
    socket.on('waiting', ()=> setStatus('Waiting for a match...'))
    socket.on('match_found', (data)=>{
      setRoomId(data.roomId)
      setStatus('Matched — chatting now')
      setView('chat')
    })
    socket.on('receive_message', (m)=>{
      setMessages(prev => [...prev, {from:'them', text:m.text}])
    })
    socket.on('chat_ended', ()=>{
      setStatus('Session ended — all data cleared')
      setRoomId(null)
      setMessages([])
      setTimeout(()=> setView('home'), 1200)
    })
    socket.on('disconnect', ()=> setStatus('Disconnected'))
    return ()=> {
      try { socket.disconnect(); socket.off(); } catch(e){}
    }
  },[])

  function toggle(tag){
    setSelected(prev => prev.includes(tag) ? prev.filter(t=>t!==tag) : [...prev, tag])
  }

  function start(){
    try {
      socket.connect()
      socket.emit('join_waitlist', { interests: selected })
    } catch(e){
      console.error(e)
    }
  }

  function send(){
    const txt = inputRef.current.value.trim()
    if(!txt || !roomId) return
    socket.emit('send_message', { roomId, message: txt })
    setMessages(prev => [...prev, {from:'me', text: txt}])
    inputRef.current.value = ''
  }

  function endChat(){
    if(roomId) socket.emit('leave_chat', { roomId })
  }

  const tags = ['Gaming','Movies','Food','Tech','Fitness','Music','Travel','Art','Books','Coding']

  return (
    <div className="app">
      <div className="card">
        <header className="nav">
          <div className="logo">ChatMitra</div>
          <div className="badge">No login • Ephemeral</div>
        </header>

        {view === 'home' && (
          <div className="home">
            <h1>Welcome to ChatMitra</h1>
            <p className="tagline">Your space to talk, share, and disappear.</p>

            <div className="tags">
              {tags.map(t => (
                <button key={t} className={selected.includes(t) ? 'tag active':'tag'} onClick={()=>toggle(t)}>{t}</button>
              ))}
            </div>

            <div className="custom">
              <input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Add custom interest" />
              <button onClick={()=>{
                if(custom.trim()){ toggle(custom.trim()); setCustom('') }
              }}>Add</button>
            </div>

            <div className="actions">
              <button className="start" onClick={start}>Start Chat</button>
              <div className="small">Matching by shared interests, will fallback to random if no match.</div>
            </div>
          </div>
        )}

        {view === 'chat' && (
          <div className="chat">
            <div className="chat-top">
              <div>{status}</div>
              <button className="end" onClick={endChat}>End Chat</button>
            </div>

            <div className="messages" id="msgbox">
              {messages.map((m,i)=>(
                <div key={i} className={m.from==='me' ? 'msg me':'msg them'}>{m.text}</div>
              ))}
            </div>

            <div className="composer">
              <input ref={inputRef} placeholder="Type your message..." onKeyDown={(e)=>{ if(e.key==='Enter') send() }} />
              <button onClick={send}>Send</button>
            </div>
          </div>
        )}

        <footer className="foot">© {new Date().getFullYear()} ChatMitra — Ephemeral chats</footer>
      </div>
    </div>
  )
}
