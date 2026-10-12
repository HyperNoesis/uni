# Deploying CAMPUS (Vercel + Render)
Vercel "drop" uploads static files only. CAMPUS is a pnpm monorepo, and its realtime server needs WebSockets, which Vercel does not host.
1. Render: deploy `render.yaml` (api, realtime, worker). Note the two public URLs.
2. Vercel: import the project from GitHub (not drag-and-drop). Root Directory = `apps/web`. Framework = Next.js.
   Env vars: NEXT_PUBLIC_API_URL=https://<api>.onrender.com  NEXT_PUBLIC_REALTIME_URL=wss://<realtime>.onrender.com
3. On the API set API_ORIGIN to your Vercel URL (CORS), and real SESSION_SECRET / INTERNAL_SECRET.
The "You're offline" page in a Vercel preview is the service-worker fallback: the page could not reach the API.
