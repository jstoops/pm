# Code Review

Date: 2026-10-01
Scope: whole repository at `bea2f98` (backend, frontend, Docker, scripts, tests).

## Summary

The codebase is small, consistent and easy to follow. All board writes go through one function (`apply_operations`), and every write runs in a transaction. The server is the single source of truth. AI output is checked against a schema and applied all at once or not at all. Tests cover the main flows at every layer, and the AI is mocked in all of them. No high-severity issues were found. The findings below are mostly edge cases that give an unclear 500 error or a confusing UI state, plus some gaps in the build setup and tests.

Severity: **Medium** = a user can realistically hit it; **Low** = an edge case or small annoyance; **Nit** = cleanup.

## Findings

### 1. Medium - Empty `choices` from OpenRouter gives a 500 instead of a 502

`backend/app/openrouter.py:32` reads `response.json()["choices"][0]`. If the reply has an empty `choices` list, this raises `IndexError`. The `except` at line 43 catches `KeyError, TypeError, ValueError`, but not `IndexError`, so the error is not turned into `OpenRouterError`. `request_ai_update` therefore does not catch it, and the request fails with an unhandled 500 instead of the 502 the rest of the AI path uses.

Fix: add `IndexError` to the tuple, or catch `LookupError`, which covers both `KeyError` and `IndexError`. Add a unit test for `ask_openrouter` that uses a mocked transport (see finding 10).

### 2. Medium - A session pointing at a deleted user gives a 500, and the UI never recovers

A session cookie stays valid as long as `SESSION_SECRET` is unchanged, and the README recommends setting it. If the database volume is then removed (`docker compose down -v`, or a fresh volume), the cookie still holds the old `user_id`. `_board_id` (`backend/app/database.py:170`) then runs `INSERT INTO boards (user_id)` for a user that no longer exists. With `foreign_keys = ON`, this raises `sqlite3.IntegrityError`, which becomes a 500. The frontend shows "Unable to load the board." with a Retry button that can never work, because only a 401 sends the user to `/login`.

Fix: in `require_authenticated`, or where the board is first loaded, treat a `user_id` with no matching `users` row as unauthenticated. Clear the session and return 401.

### 3. Medium - AI changes are made against a board snapshot that can be up to 30 seconds old

`request_ai_update` (`backend/app/ai.py:52`) reads the board in one transaction, calls OpenRouter (up to 30 s), and applies the operations in a second transaction. The user can keep editing while the assistant shows "Thinking...". If they delete or move a card in that time, the AI's operations are applied to a board it never saw:

- The card IDs it uses may no longer exist. The whole reply is then rejected with a generic 502, "invalid board change".
- Positions in a `move_card` refer to the old card order, so the card can land in the wrong place without any error.

For a single-user MVP this is acceptable, but it should be a deliberate choice. Simple options: disable board editing while a chat request is in flight, or document the behavior in `docs/AI_SCHEMA.md`.

### 4. Low - Chat board updates and drag/edit responses can overwrite each other

`KanbanBoard.applyBoardChange` queues REST changes one after another and keeps only the newest response, using `boardChangeId`. Chat updates arrive through `onBoardUpdate` (`frontend/src/components/KanbanBoard.tsx:316`), which skips both the queue and the change counter. If a move request is still in flight when a chat response arrives, whichever response arrives last wins. That may be the older server state. Also, the rollback in `applyBoardChange` restores `previousBoard` as it was when the change started, which can undo a chat update that landed in between.

Fix: have chat updates bump `boardChangeId.current` before calling `setBoard`. That makes any in-flight REST response stale.

### 5. Low - A failed column rename leaves the unsaved title in the input

`ColumnTitle` (`frontend/src/components/KanbanColumn.tsx:24`) is keyed by `column.title`. If the PATCH fails (for example a 422 for a title over 120 characters, since the input has no `maxLength`, or a network error), `column.title` does not change. The component therefore does not reset, and the input keeps the rejected text while the error banner says "Your board is unchanged." After a reload, the old title comes back.

Fix: add `maxLength={120}` to the input, and reset the local title when the save fails. One simple way: key the component by the board-change counter as well as the title.

### 6. Low - Over-length card input fails after the form has already been cleared

The backend limits are: card title 240 characters, details 4000, column title 120. None of these are set as `maxLength` on the inputs (`NewCardForm.tsx`, `KanbanCard.tsx`, `KanbanColumn.tsx`). `NewCardForm` clears and closes itself before the request finishes. If the request then fails with a 422, everything the user typed is lost and only a generic error appears.

Fix: add matching `maxLength` attributes to the inputs. This is a one-line change per input and needs no new validation code.

### 7. Low - AI and OpenRouter failures are not logged

`request_ai_update` turns every OpenRouter and validation failure into the same generic message, and nothing logs the cause. The specific messages in `openrouter.py` (timeout, HTTP status, 429) are visible only through the smoke script. In the running app, a 502 from `/api/chat` leaves no trace of why it failed. That works against the project rule to find the root cause with evidence before fixing anything.

Fix: in `request_ai_update`, log the exception, plus the raw model output when validation fails, before raising `AIOutputError`.

### 8. Low - `.dockerignore` does not exclude `backend/.venv`

Patterns in `.dockerignore` are matched from the build context root, so `.venv` only excludes `/.venv`. If anyone runs `uv sync` or `uv run` on the host inside `backend/`, the resulting `backend/.venv` is copied by `COPY backend /app` and overwrites the Linux venv that `uv sync` built in the image. On a Windows host, that breaks the container.

`frontend/out` and `frontend/tsconfig.tsbuildinfo` are not excluded either. They are harmless but enlarge the build context.

Fix: add `backend/.venv`, `frontend/out` and `frontend/tsconfig.tsbuildinfo` to `.dockerignore`.

### 9. Low - The login check holds the database write lock while hashing

`authenticate_mvp_user` (`backend/app/database.py:97`) runs Argon2 hashing or verification inside `transaction()`, which uses `BEGIN IMMEDIATE`. Argon2 is slow on purpose, so every login blocks all board writes for that time. It doesn't matter with one user, but the fix is simple: read the row, close the transaction, verify the password, and use a write transaction only for the first-time insert.

### 10. Low - Test gaps

- No tests for `ask_openrouter` itself. The 429, timeout, non-JSON, empty-`choices` and empty-content paths are untested; finding 1 shows a real bug in this area. `httpx.MockTransport`, or monkeypatching `httpx.post`, would cover them without a live call.
- Backend move tests only cover moving a card to position 0 of another column. There are none for moving down within the same column, a `position` past the end (clamped), or delete followed by renumbering. These are the trickiest parts of `apply_operations`.
- No test for the stale-session case (finding 2).
- No frontend test that a failed optimistic move rolls back the board.

### 11. Nit - Smaller items

- `openrouter.py:38`: the 429 message says "the configured free model", but `openai/gpt-oss-120b` is not the `:free` variant.
- `frontend/package.json`: the `start` script (`next start`) does not work with `output: "export"`, and `frontend/public/*.svg` are unused Next.js template files. FastAPI doesn't serve `public/` assets anyway.
- `KanbanBoard.handleDragEnd` sends a move request even when the card ends up in the same column and position (for example, dropping it just in front of its own next sibling). It's harmless, but each one is a wasted write and re-render.
- `logout` in `KanbanBoard.tsx` does nothing on a non-OK response; the user gets no feedback.
- `boards.updated_at` and `users.updated_at` are never updated after insert. `cards.updated_at` is.

## What is done well

- One mutation path (`apply_operations`) for REST and AI. It checks ownership on every operation and keeps positions contiguous with a simple two-step renumbering that avoids `UNIQUE` conflicts.
- All-or-nothing AI changes: the reply is checked against Pydantic models with a discriminated union, the number of operations is capped, and a single transaction means a bad reply leaves the board unchanged.
- Sound security for an MVP: Argon2id hashes, a signed HTTP-only `SameSite=Lax` cookie, every board route behind `UserId`, ownership enforced in SQL, `.env` kept out of git and out of the image, and the API key never sent to the browser.
- The Playwright suite runs on a separate Compose project with its own volume, so tests cannot damage the real board.
- The documentation (`CLAUDE.md`, each directory's `AGENTS.md`, `docs/`) is accurate and matches the code.

## Recommended order

1. Finding 1 (one-line fix, plus tests from 10).
2. Finding 2 (stale session gives a 500 and the UI gets stuck).
3. Finding 8 (`.dockerignore`, one-line fix that prevents a confusing broken build).
4. Findings 5 and 6 (`maxLength` attributes and rename reset).
5. Finding 7 (logging), then decide on 3 and 4.
