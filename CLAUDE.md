# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, coding standards (simplicity, no emojis, root-cause debugging) and the color scheme live in the root `AGENTS.md`. Each of `backend/`, `frontend/` and `scripts/` has its own `AGENTS.md`; read it before changing that directory, and keep it accurate when behavior changes. Planning docs are in `docs/` (`PLAN.md` tracks delivery parts; `DATABASE.md` and `AI_SCHEMA.md` are the approved designs).

## Commands

The app runs only via Docker (uv is installed in the container, not necessarily on the host).

```powershell
scripts/start.ps1 [-Port 8000]     # or scripts/start.sh [port]; builds and waits for health check
scripts/stop.ps1                   # or scripts/stop.sh
scripts/smoke-openrouter.ps1       # opt-in live OpenRouter call; never part of automated tests

# Backend tests (in container)
docker compose run --rm app uv run --group test pytest
docker compose run --rm app uv run --group test pytest tests/test_board_api.py::test_name

# Frontend (from frontend/)
npm run lint
npm run test:unit                          # Vitest
npx vitest run src/lib/kanban.test.ts      # single file
npm run test:e2e                           # Playwright
npm run build                              # static export to out/
```

Playwright starts `next dev` on :3000 by default, but the frontend has no API proxy, so flows that hit `/api` need the backend. Set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000` to run e2e against the Docker-served app.

## Architecture

- Single container: the Dockerfile builds the Next.js static export (`output: "export"`, `trailingSlash: true`) and copies `frontend/out/` into `backend/app/static/`. FastAPI (`backend/app/main.py`) serves it. There is no Next.js server at runtime, so no SSR, server actions or API routes in the frontend.
- FastAPI serves `/` and `/login` explicitly, choosing the board or login HTML based on the session; `/_next` is a static mount. All API routes are under `/api`.
- Auth: hardcoded `user`/`password`, verified against an Argon2id hash in SQLite, then a signed HTTP-only session cookie (Starlette `SessionMiddleware`) storing `user_id`. Board routes call `require_authenticated`. `SESSION_SECRET` defaults to a random value per process, so sessions reset on restart unless set.
- Persistence: `backend/app/database.py` owns raw `sqlite3` access (no ORM, no migrations), schema creation, seeding, and all board mutations. DB path is `DATABASE_PATH` (default `/app/data/project_management.db` on a named Docker volume). Positions are kept contiguous; moves run in one transaction.
- Every board mutation endpoint returns the full board in the frontend `BoardData` shape (integer DB ids serialized as strings). The frontend replaces its state with that response; the backend is the single source of truth, no client-side board copy.
- AI: `POST /api/chat` -> `app/ai.py` builds a prompt with the current board + up to 12 history messages -> `app/openrouter.py` calls OpenRouter (`openai/gpt-oss-120b`, `OPENROUTER_API_KEY` from root `.env` via compose). The JSON reply is validated with Pydantic discriminated-union operations (see `docs/AI_SCHEMA.md`) and applied atomically via `apply_ai_operations`; any invalid op returns 502 and leaves the board unchanged.
- Frontend drag and drop: card and column ids share one DB id namespace, so dnd-kit ids must use the prefixed helpers `cardDragId` / `columnDropId` in `frontend/src/lib/kanban.ts`.

## Testing conventions

- Backend tests use HTTPX ASGI transport and a `database_path` fixture that monkeypatches `database.DATABASE_PATH` to a tmp file.
- AI tests must mock OpenRouter (monkeypatch `ai.ask_openrouter` in backend; `page.route("**/api/chat")` in Playwright). Live calls only via the smoke script.
- Keep existing accessible labels and `data-testid` values stable; tests depend on them.
- Next.js 16 has breaking changes vs. older versions; consult `frontend/node_modules/next/dist/docs/` before writing Next.js code.
