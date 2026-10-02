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
docker compose run --rm app uv run --group test pytest --cov   # 90% coverage gate
docker compose run --rm app uv run --group test pytest tests/test_boards_api.py::test_name

# Frontend (from frontend/)
npm run lint
npm run test:unit                          # Vitest; test:coverage adds the coverage gate
npx vitest run src/lib/kanban.test.ts      # single file
npm run test:e2e                           # Playwright, on a throwaway Docker stack
npm run build                              # static export to out/
```

`npm run test:e2e` starts a separate Compose project (`pm-e2e` on :8001, own volume) via `frontend/tests/global-setup.ts` and removes it afterwards, so it never touches real data. Each test registers its own user, so the suite runs in parallel. Do not point Playwright at the :8000 app: the tests create users and delete data. `npm run dev` serves only the UI (no API proxy).

## Architecture

- Single container: the Dockerfile builds the Next.js static export (`output: "export"`, `trailingSlash: true`) and copies `frontend/out/` into `backend/app/static/`. FastAPI (`backend/app/main.py`) serves it. There is no Next.js server at runtime, so no SSR, server actions or API routes in the frontend.
- FastAPI serves `/`, `/login`, `/register`, `/account` and `/favicon.ico` explicitly, choosing the page (or a redirect) based on the session; `/_next` is a static mount. All API routes are under `/api`. Frontend links between pages are plain `<a>` full page loads for this reason.
- Auth: self-service registration plus a demo `user`/`password` account created at startup. Passwords are Argon2id hashes in SQLite; login sets a signed HTTP-only session cookie (Starlette `SessionMiddleware`) storing `user_id`. Board routes take the `UserId` dependency, which also rejects sessions of deleted accounts. `SESSION_SECRET` defaults to a random value per process, so sessions reset on restart unless set; the frontend redirects to `/login` on any 401.
- Persistence: `backend/app/database.py` owns raw `sqlite3` access (no ORM), schema migrations (append-only `MIGRATIONS`, tracked by `PRAGMA user_version`, run once in the FastAPI lifespan), users, seeding, and all board mutations. DB path is `DATABASE_PATH` (default `/app/data/project_management.db` on a named Docker volume). Every call runs in `transaction()` (`BEGIN IMMEDIATE`). Positions are kept contiguous.
- Board changes: operation models in `backend/app/operations.py` (with title validation) are applied by `apply_operations` in `database.py`. REST routes build one operation each; the AI path passes its validated list. This is the only place board data is changed.
- Every board mutation endpoint returns the full board in the frontend `BoardData` shape (integer DB ids serialized as strings). The frontend replaces its state with that response; the backend is the single source of truth, no client-side board copy.
- Boards: a user has any number of boards. Every board route is under `/api/boards/{id}` and checks ownership (404 otherwise), including column and card ids from other boards.
- AI: `POST /api/boards/{id}/chat` -> `app/ai.py` builds a prompt with that board + up to 12 history messages -> `app/openrouter.py` calls OpenRouter (`openai/gpt-oss-120b`, `OPENROUTER_API_KEY` from root `.env` via compose). The request sets a JSON-schema `response_format`; the reply is validated with the Pydantic operation models (see `docs/AI_SCHEMA.md`) and applied atomically via `apply_operations`; any invalid op returns 502 and leaves the board unchanged.
- Frontend drag and drop: card and column ids share one DB id namespace, so dnd-kit ids must use the prefixed helpers `cardDragId` / `columnDropId` in `frontend/src/lib/kanban.ts`. Pointer drops land in front of the card under the pointer; keyboard drops take the target card's slot (`afterTarget` in `moveCard`).

## Testing conventions

- Backend tests use HTTPX ASGI transport (which does not run the lifespan). The autouse `database_path` fixture in `backend/tests/conftest.py` points `database.DATABASE_PATH` at a tmp file and runs the migrations; `new_client()` gives a separate browser session for cross-user tests.
- Frontend component tests use the in-memory fake API in `frontend/src/test/fakeApi.ts`.
- AI tests must mock OpenRouter (monkeypatch `ai.ask_openrouter` in backend; `page.route("**/api/chat")` in Playwright). Live calls only via the smoke script.
- Keep existing accessible labels and `data-testid` values stable; tests depend on them.
- Next.js 16 has breaking changes vs. older versions; consult `frontend/node_modules/next/dist/docs/` before writing Next.js code.
