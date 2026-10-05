# Project Management

Kanban boards with an AI assistant, served from one Docker container (Next.js static frontend, FastAPI backend, SQLite).

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

Open http://localhost:8000 and create an account, or sign in with the demo account `user` / `password`. Stop with `scripts/stop.ps1` or `scripts/stop.sh`.

## Test

```
docker compose run --rm app uv run --group test pytest --cov   # backend, 90% coverage gate
cd frontend && npm run lint && npm run test:coverage           # frontend unit tests with coverage gate
cd frontend && npm run test:e2e                                # end-to-end, on a separate throwaway stack
```

## Project Summary

It's a project management app. Yes, a Kanban board, the "hello world" of people who already know how to write hello world. It started as a one-board MVP (parts 1 to 10 of `docs/PLAN.md`), then part 11 added real accounts and as many boards as you have projects. Scope creep, but the documented kind.

### What it does

- **Accounts:** register, sign in, change your password, or delete your account and everything in it. The demo account `user` / `password` is still there for the impatient.
- **Boards:** as many as you like, listed in a sidebar. Columns can be added, renamed, reordered and deleted. Cards can be created, edited, deleted and dragged around.
- **AI chat sidebar:** you ask `openai/gpt-oss-120b`, via OpenRouter, to rearrange your cards, and now your columns too, so you don't have to drag anything yourself. You can hide the panel when you'd rather not be helped.
- **Looks:** a full-width board with a stage icon and accent color per column, in the project palette. Someone finally stopped treating the color scheme in `AGENTS.md` as a suggestion.

### How it's built

- **One Docker container.** Next.js is built as static files, which FastAPI then serves. There's no Next.js server at runtime, so Next.js is basically just making the HTML.
- **Backend:** FastAPI with raw `sqlite3`. No ORM, small append-only migrations tracked by `PRAGMA user_version`, and every write goes through a `BEGIN IMMEDIATE` transaction.
- **One way to change the board:** every edit, from the REST routes or the AI, goes through `apply_operations` in `backend/app/database.py`. Every write endpoint returns the whole board, and the frontend just displays it. The server holds the real data and the frontend keeps no copy of its own. Every route lives under `/api/boards/{id}` and checks that the board, column and card are yours; anything else is a 404, so you can't even confirm your neighbor has a board.
- **AI guardrails:** the model has to reply in a fixed JSON format. Each operation in the reply is checked, and they're all applied together. If any one is invalid, you get a 502 and the board isn't touched. So the AI can't half-break your board, only fully fail to help.
- **Auth:** Argon2id password hashes plus a signed session cookie, and sessions of deleted accounts are rejected. New passwords need at least 8 characters, a rule the demo password `password` passes with exactly zero to spare.

### Tests

- **Backend:** pytest, run inside the container, including cross-user isolation checks on every route. Coverage below 90% fails the run, so nobody gets to skip the boring tests.
- **Frontend:** Vitest for unit tests against an in-memory fake API, with its own coverage gate, and Playwright end-to-end tests on a separate throwaway Docker stack so they can't wreck your real boards. Each e2e test registers its own user, so they run in parallel.
- **AI calls:** always mocked in tests. The only live OpenRouter call is in the opt-in smoke script, so your test suite doesn't run up an API bill.

Overall it's a small, tidy, well-documented app that has now survived four code reviews by four different AIs, plus a simplification pass that deleted more lines than it added. Most production systems get less scrutiny, and most of them have more than one real user.
