# Backend Instructions

## Current Application

The backend is a minimal FastAPI service packaged by the root Docker image. It is managed with `uv`; `pyproject.toml` contains runtime dependencies and the `test` dependency group, and `uv.lock` pins every version (the image installs with `uv sync --locked`).

- `app/main.py` creates the FastAPI application. Its lifespan handler creates the SQLite schema once at startup.
- `GET /` serves the login export until the user has an authenticated session, then serves the board export. The Docker build replaces `app/static/` with the frontend `out/` directory.
- `GET /api/health` returns `{ "status": "ok" }` for container and service checks.
- `POST /api/auth/login` accepts only `user` / `password` and establishes a signed, HTTP-only session cookie.
- `GET /api/auth/session` reports whether the request is authenticated; `POST /api/auth/logout` clears the session.
- `GET /api/board` returns the authenticated user's persisted board. The column/card routes under `/api/board` rename, create, update, delete, and move board data, returning the full board, or 404 when a card or column is not on the user's board.
- `POST /api/chat` sends the authenticated user's bounded conversation and current board to OpenRouter, validates the versioned response, and atomically applies valid board operations.
- `app/operations.py` defines the board operation models (`RenameColumn`, `CreateCard`, `UpdateCard`, `MoveCard`, `DeleteCard`) and the title/details constraints. Titles are stripped and must be non-empty.
- `app/database.py` owns SQLite initialization, Argon2id verification, seed data, and `apply_operations`, the single implementation of every board change. REST routes and the AI path both call it. Every database call runs in `transaction()`, which takes the SQLite write lock (`BEGIN IMMEDIATE`) and commits or rolls back as a unit.
- `app/ai.py` owns the AI response schema, OpenRouter prompt construction (with a JSON-schema `response_format`), and validated board-command orchestration.
- `tests/` contains backend API and static-root tests using HTTPX ASGI transport. `tests/conftest.py` gives every test its own temporary SQLite database.

## Commands

Run backend tests through Docker because `uv` is installed in the container:

```powershell
docker compose run --rm app uv run --group test pytest
```

The root start scripts build and start the application at `http://localhost:8000` by default.

## Change Guidelines

- Keep API routes under `/api` so the root path remains available for static frontend serving.
- Add runtime dependencies to `pyproject.toml` and test-only dependencies to the `test` dependency group.
- Do not read, return, or log secrets from the root `.env` file.
- Keep the root static mount after API route definitions so `/api` routes are never handled as static files.
- Keep board routes and future board API endpoints behind `require_authenticated` (use the `UserId` dependency).
- Add new board changes as an operation model in `app/operations.py` and a case in `apply_operations`, not as separate SQL in a route.
- Local development uses HTTP. Non-local deployments must terminate TLS 1.2+, prefer TLS 1.3, and set `SESSION_HTTPS_ONLY=true`.