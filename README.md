# Project Management MVP

A Kanban board with an AI assistant, served from one Docker container (Next.js static frontend, FastAPI backend, SQLite).

## Setup

Requires Docker. Create `.env` in the project root:

```
OPENROUTER_API_KEY=your-key
SESSION_SECRET=any-long-random-string
```

`SESSION_SECRET` is optional; without it, sign-ins end whenever the container restarts.

## Run

```
scripts/start.ps1      # Windows (optional -Port 8000)
scripts/start.sh       # macOS/Linux (optional port argument)
```

Open http://localhost:8000 and sign in as `user` / `password`. Stop with `scripts/stop.ps1` or `scripts/stop.sh`.

## Test

```
docker compose run --rm app uv run --group test pytest   # backend
cd frontend && npm run lint && npm run test:unit         # frontend unit tests
cd frontend && npm run test:e2e                          # end-to-end, on a separate throwaway stack
```
