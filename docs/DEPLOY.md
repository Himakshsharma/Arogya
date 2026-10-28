# Deploying Arogya

The whole product (React app + API + WebSockets) runs as **one Docker container**, so it deploys to any host that runs Docker.

## Render (free)

Uses `Dockerfile.lite`: the browser handles speech, the phrasebook handles translation.

1. https://render.com, then **New > Blueprint**, and pick this repository (or paste its public URL).
2. Render reads `render.yaml`, creates the `arogya` web service and generates `AROGYA_SECRET_KEY`.
3. Wait for "Deploy live", then open the `onrender.com` URL. `/api/health` should return `"status": "ok"`.
4. If the repository is connected through the GitHub app, pushes to `main` redeploy automatically. If it was added by public URL, use **Manual Deploy** after each push.

Free instances sleep after 15 idle minutes; the next request takes about a minute. The disk resets on each deploy, so use a persistent disk or Postgres for real data.

## Full image (Whisper, gTTS, MarianMT)

`Dockerfile` adds the optional AI features and needs about 4 GB of RAM. It runs on any Docker host (a paid Render instance, a VPS, a GPU box):

```bash
docker build -t arogya .
docker run -p 7860:7860 -e AROGYA_SECRET_KEY=change-me arogya
```

## Alternative: frontend on Vercel, API elsewhere

1. Deploy the API with either option above.
2. Vercel → **Add New Project** → import the repository → **Root Directory** `frontend`.
3. Environment variable `VITE_API_URL` = the API URL (for example `https://arogya-rgjh.onrender.com`).
4. On the API, set `AROGYA_CORS_ORIGINS` to the Vercel URL.
5. `frontend/vercel.json` (already in the repo) sends every route to `index.html`, so links like `/rx/abc` work.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `AROGYA_SECRET_KEY` | dev value | **Set this in production.** Signs login tokens |
| `AROGYA_DB_PATH` | `backend/arogya.db` | SQLite file |
| `AROGYA_CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `AROGYA_ENABLE_WHISPER` | off | Server speech recognition |
| `AROGYA_WHISPER_MODEL` | `base` | `tiny`, `base`, `small` … |
| `AROGYA_ENABLE_SERVER_TTS` | off | Server voice (gTTS) |
| `AROGYA_TRANSLATION_ENGINE` | `auto` | `phrasebook`, `marian`, `indictrans2`, `auto` |
| `AROGYA_SEED_DEMO` | on | Create the demo doctor account |
| `PORT` | 7860 / 8000 | Port to listen on |

## Camera and microphone need HTTPS

Browsers only allow the camera and microphone on `https://` or `localhost`. Render provides HTTPS automatically.
