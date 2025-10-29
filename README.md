# ChatMitra — Starter (Frontend + Backend)

Brand: ChatMitra
Tagline: Your space to talk, share, and disappear.

This repository is a ready-to-deploy starter for an anonymous, ephemeral, interest-based chat app using React (Vite) for frontend and Node + Express + Socket.io for backend.

What's included
- /frontend — Vite + React starter, dark UI, interest selector, Socket.io client.
- /backend — Express + Socket.io ephemeral chat server (in-memory sessions).
- .env.example files for both frontend and backend.
- render.yaml — sample Render service config (edit repo URL before use).
- vercel.json — sample Vercel config for frontend (optional).
- README.md — this file with deploy instructions.

Quick local run (dev)

Backend (local)
```bash
cd backend
npm install
npm run dev   # requires nodemon, or `npm start` to run directly
```
Server listens on http://localhost:4000 by default.

Frontend (local)
Open a new terminal:
```bash
cd frontend
npm install
# create a .env file based on .env.example (or set VITE_SOCKET_URL=http://localhost:4000)
npm run dev
```
Open http://localhost:5173 (Vite default).

Deploying (recommended: Render for backend, Vercel for frontend)

1) Push to GitHub
Create a GitHub repo and push the project root (containing frontend/ and backend/).

2) Deploy backend to Render
- Sign up at https://render.com and connect your GitHub.
- Create a new Web Service and point it to the backend folder of this repo.
- Use npm install as build command and npm start as start command.
- Set environment variables if needed (port is auto-detected).

A typical render.yaml is included — edit the repo field to your repository URL if you want to use Render's Infrastructure as Code import feature.

3) Deploy frontend to Vercel
- Sign up at https://vercel.com and connect GitHub.
- Import the project and select the frontend folder as the root for the project.
- Set the environment variable VITE_SOCKET_URL to your backend URL (e.g. https://chatmitra-backend.onrender.com).
- Deploy. Vercel gives you a live URL like https://your-project.vercel.app.

Notes & Next Steps
- This starter stores messages only in memory and deletes all room info on disconnect per your ephemeral rule.
- For production scale, add Redis as an adapter for Socket.io and implement rate-limiting & moderation.
- Update CORS in backend/server.js to restrict to your Vercel URL once deployed.

Happy launching — ChatMitra!
