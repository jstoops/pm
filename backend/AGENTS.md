# Backend Instructions

## Current Application

The backend is a minimal FastAPI service packaged by the root Docker image. It is managed with `uv`; `pyproject.toml` contains runtime dependencies and the `test` dependency group.

- `app/main.py` creates the FastAPI application.
- `GET /` serves the exported Next.js application from `app/static/`; the Docker build replaces this directory with the frontend `out/` directory.
- `GET /api/health` returns `{ "status": "ok" }` for container and service checks.
- `GET /api/example` returns a simple JSON message used to prove API connectivity.
- `tests/` contains backend API and static-root tests using HTTPX ASGI transport.

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