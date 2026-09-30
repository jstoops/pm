# Backend Instructions

## Current Application

The backend is a minimal FastAPI service packaged by the root Docker image. It is managed with `uv`; `pyproject.toml` contains runtime dependencies and the `test` dependency group.

- `app/main.py` creates the FastAPI application.
- `GET /` serves the login export until the user has an authenticated session, then serves the board export. The Docker build replaces `app/static/` with the frontend `out/` directory.
- `GET /api/health` returns `{ "status": "ok" }` for container and service checks.
- `GET /api/example` returns a simple JSON message used to prove API connectivity.
- `POST /api/auth/login` accepts only `user` / `password` and establishes a signed, HTTP-only session cookie.
- `GET /api/auth/session` reports whether the request is authenticated; `POST /api/auth/logout` clears the session.
- `GET /api/board` returns the authenticated user's persisted board. The column/card routes under `/api/board` rename, create, update, delete, and move board data.
- `POST /api/chat` sends the authenticated user's bounded conversation and current board to OpenRouter, validates the versioned response, and atomically applies valid board operations.
- `app/database.py` owns SQLite initialization, Argon2id verification, seed data, and board mutations.
- `app/ai.py` owns the AI response schema, OpenRouter prompt construction, and validated board-command orchestration.
- `tests/` contains backend API and static-root tests using HTTPX ASGI transport, including temporary SQLite databases for persistence coverage.

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
- Keep board routes and future board API endpoints behind `require_authenticated`.
- Local development uses HTTP. Non-local deployments must terminate TLS 1.2+, prefer TLS 1.3, and set `SESSION_HTTPS_ONLY=true`.