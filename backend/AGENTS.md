# Backend Instructions

## Current Application

The backend is a FastAPI service packaged by the root Docker image. It is managed with `uv`; `pyproject.toml` contains runtime dependencies and the `test` dependency group, and `uv.lock` pins every version (the image installs with `uv sync --locked`).

- `app/main.py` creates the FastAPI application and every route. Its lifespan handler runs `initialize_database()` once at startup.
- Pages: `GET /` serves the login export until the user has a session, then the workspace export. `/login` and `/register` redirect signed-in users to `/`; `/account` redirects signed-out users to `/login`. The Docker build replaces `app/static/` with the frontend `out/` directory.
- `GET /api/health` returns `{ "status": "ok" }` for container and service checks.
- Auth: `POST /api/auth/register` (409 if the username is taken), `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/session` (`authenticated` plus `username`). Sessions are signed, HTTP-only cookies storing `user_id`; `require_authenticated` rejects sessions whose account no longer exists.
- Account: `GET /api/account`, `POST /api/account/password`, and `POST /api/account/delete`; the last two require the current password (403 otherwise).
- Boards: `GET`/`POST /api/boards`, and `GET`/`PATCH`/`DELETE /api/boards/{id}`. Column and card routes live under `/api/boards/{id}/columns` and `/api/boards/{id}/cards`. Every mutation returns the full board; a board, column or card outside the user's boards is a 404.
- `POST /api/boards/{id}/chat` sends the bounded conversation and that board to OpenRouter, validates the versioned response, and atomically applies valid board operations.
- `app/operations.py` defines the board operation models (`UpdateBoard`, `CreateColumn`, `RenameColumn`, `MoveColumn`, `DeleteColumn`, `CreateCard`, `UpdateCard`, `MoveCard`, `DeleteCard`) and the name/title/details constraints. Names and titles are stripped and must be non-empty.
- `app/database.py` owns schema migrations (`MIGRATIONS`, tracked with `PRAGMA user_version`), Argon2id hashing, users, board creation and seeding, and `apply_operations`, the single implementation of every change inside a board. REST routes and the AI path both call it. Every database call runs in `transaction()`, which takes the SQLite write lock (`BEGIN IMMEDIATE`) and commits or rolls back as a unit.
- `app/ai.py` owns the AI response schema, OpenRouter prompt construction (with a JSON-schema `response_format`), and validated board-command orchestration.
- `tests/` uses HTTPX ASGI transport. `tests/conftest.py` gives every test its own temporary SQLite database and provides `client`, `new_client()` (a separate browser session), `login`, `register` and `first_board` helpers.

## Commands

Run backend tests through Docker because `uv` is installed in the container:

```powershell
docker compose run --rm app uv run --group test pytest --cov
```

`--cov` enforces the 90% coverage gate configured in `pyproject.toml`; leave it off when running a single test.

The root start scripts build and start the application at `http://localhost:8000` by default.

## Change Guidelines

- Keep API routes under `/api` so the root path remains available for static frontend serving.
- Add runtime dependencies to `pyproject.toml` and test-only dependencies to the `test` dependency group.
- Do not read, return, or log secrets from the root `.env` file.
- Keep the root static mount after API route definitions so `/api` routes are never handled as static files.
- Keep board routes and future board API endpoints behind `require_authenticated` (use the `UserId` dependency).
- Add new board changes as an operation model in `app/operations.py` and a case in `apply_operations`, not as separate SQL in a route.
- Change the schema only by appending to `MIGRATIONS`; never edit a migration that has shipped. Add a test that upgrades a database from the previous version.
- Local development uses HTTP. Non-local deployments must terminate TLS 1.2+, prefer TLS 1.3, and set `SESSION_HTTPS_ONLY=true`.
