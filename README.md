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

## Project Summary

It's a project management app. Yes, a Kanban board, the "hello world" of people who already know how to write hello world. Every box in all 10 parts of `docs/PLAN.md` is checked, so it's done in the "MVP, runs on my machine, password is literally `password`" sense.

### What it does

- **Sign-in:** the only account is `user` / `password`. The database can hold multiple users, which is a nice touch for an app that has exactly one.
- **The board:** one per user, with fixed columns you can rename. Cards can be created, edited, deleted and dragged around.
- **AI chat sidebar:** you ask `openai/gpt-oss-120b`, via OpenRouter, to rearrange your cards so you don't have to drag them yourself.

### How it's built

- **One Docker container.** Next.js is built as static files, which FastAPI then serves. There's no Next.js server at runtime, so Next.js is basically just making the HTML.
- **Backend:** FastAPI with raw `sqlite3`. No ORM, no migrations, and every write goes through a `BEGIN IMMEDIATE` transaction.
- **One way to change the board:** every edit, from the REST routes or the AI, goes through `apply_operations` in `backend/app/database.py`. Every write endpoint returns the whole board, and the frontend just displays it. The server holds the real data and the frontend keeps no copy of its own.
- **AI guardrails:** the model has to reply in a fixed JSON format. Each operation in the reply is checked, and they're all applied together. If any one is invalid, you get a 502 and the board isn't touched. So the AI can't half-break your board, only fully fail to help.
- **Auth:** an Argon2id password hash plus a signed session cookie. That's real security wrapped around the password `password`.

### Tests

- **Backend:** pytest, run inside the container.
- **Frontend:** Vitest for unit tests, and Playwright end-to-end tests on a separate throwaway Docker stack so they can't wreck your real board.
- **AI calls:** always mocked in tests. The only live OpenRouter call is in the opt-in smoke script, so your test suite doesn't run up an API bill.

Overall it's a small, tidy, well-documented app that's clearly been reviewed by more AIs than most production systems.
