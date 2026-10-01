# Code Review

Date: 2026-09-30. Scope: the whole repository at commit `19eb771` (backend, frontend, Docker, scripts, tests, docs).

At review time the backend tests (12), frontend unit tests (23), Playwright tests (11, against Docker), lint, type check and build all pass. Findings are ordered by priority. Each has an action. The checkboxes track progress.

## Summary

| # | Priority | Area | Finding |
|---|---|---|---|
| 1 | High | Frontend | Cards cannot be edited in the UI (business requirement gap) |
| 2 | High | Tests | Playwright tests delete and replace the real board when run against Docker |
| 3 | Medium | Backend | Blank (whitespace-only) titles return HTTP 500 |
| 4 | Medium | Backend | Board mutations are implemented twice (REST and AI paths) |
| 5 | Medium | Frontend | Expired sessions show generic errors instead of returning to login |
| 6 | Medium | Frontend | Clearing a column title leaves the input empty after a failed save |
| 7 | Medium | AI | Model output is not constrained to JSON by the API request |
| 8 | Medium | Tests | Default `npm run test:e2e` cannot pass |
| 9 | Low | Build | No `uv.lock`; backend dependencies are not reproducible |
| 10 | Low | Backend | Card position is computed outside a write lock |
| 11 | Low | Frontend | No keyboard support for moving cards |
| 12 | Low | Backend | Schema DDL runs on every login and board read |
| 13 | Low | Tests | `test_main.py` writes to the real database volume |
| 14 | Low | Cleanup | Dead code, stray files and a version mismatch |

## High

### 1. Cards cannot be edited in the UI

`AGENTS.md` requires that cards "can be moved with drag and drop, and edited". The backend supports `PATCH /api/board/cards/{id}`, but no frontend component calls it. `KanbanCard.tsx` only renders the title, details and a delete button, and the only `PATCH` in `KanbanBoard.tsx` is the column rename. Users can only change a card's text through the AI chat.

- [ ] Add inline editing of title and details to `KanbanCard` (for example, click to edit, then save on submit or blur), wired through `applyBoardChange` to `PATCH /api/board/cards/{id}`.
- [ ] Add a unit test in `KanbanBoard.test.tsx` and a Playwright test that confirms an edit persists after reload.

### 2. Playwright tests destroy real board data

`frontend/tests/kanban.spec.ts` `resetCards` deletes every card on the board and replaces them with Alpha, Beta, Gamma and Solo. It runs before each of the four "drops near the top of a column" tests. Other tests add "Persistent card", "Moved card" and "Logged out card" entries that are never removed. Because the documented way to run e2e is against the Docker app (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000`), the tests run against the `app-data` volume, so every run wipes the user's real board.

- [ ] Run e2e against a disposable database. The simplest option is a separate compose project for tests, for example `docker compose -p pm-test up` with its own volume and port, or set `DATABASE_PATH=/tmp/e2e.db` for the test container.
- [ ] Update `frontend/AGENTS.md` and `CLAUDE.md` to make the isolated setup the documented way to run e2e.

## Medium

### 3. Blank titles return HTTP 500

`backend/app/main.py` strips titles after Pydantic validation. `ColumnRenameRequest` and `CardCreateRequest` accept `"   "` (length is at least 1), the stripped `""` reaches SQLite, and the `CHECK (length(trim(title)) > 0)` constraint raises an uncaught `sqlite3.IntegrityError`. Verified in the container against a temporary database: renaming a column to `"   "` returns 500, creating a card titled `"  "` returns 500, and renaming to `""` returns 422. The AI path has the same issue: a whitespace-only title in `rename_column`, `create_card` or `update_card` raises `IntegrityError`, not `AICommandError`, so `/api/chat` returns 500 instead of 502 (the transaction still rolls back). `update_board_card` works around this with a manual check.

- [ ] Validate titles once in the models using Pydantic's `StringConstraints(strip_whitespace=True, min_length=1, max_length=...)` (an `Annotated` type), in both `main.py` request models and `ai.py` operation models. Then remove the manual `.strip()` calls and the empty-title check in `update_board_card`.
- [ ] Add backend tests for whitespace-only titles on rename, create, update and the AI path.

### 4. Board mutations are implemented twice

`database.py` has one set of functions for the REST routes (`rename_column`, `create_card`, `update_card`, `delete_card`, `move_card`) and a parallel set for AI operations (`_rename_column_in_connection`, `_create_card_in_connection`, and so on). The ownership checks, position logic and SQL are duplicated. `PLAN.md` Part 9 says AI changes go "through the same service layer used by board APIs", which is not the case today. `apply_ai_operations` also converts the validated Pydantic operations back into dicts, re-casts each field with `int()`/`str()`, and keeps an unreachable "unsupported operation" branch.

- [ ] Make the `_..._in_connection` helpers the single implementation. Have each REST function open a connection, look up the board id and call the same helper, mapping `AICommandError` (renamed to something like `BoardNotFoundError`) to 404.
- [ ] Pass the typed operation models to `apply_ai_operations` and dispatch on type, removing the dict round trip and the unreachable branch.

### 5. Expired sessions are not handled

`SESSION_SECRET` defaults to a new random value on every process start, so each container restart logs everyone out. An open board tab then gets 401 on every action, and the UI shows only "Unable to save that change" or "Unable to reach the assistant". On the initial load, "Retry" fails the same way indefinitely. Nothing sends the user back to the login page.

- [ ] In `boardRequest` (`KanbanBoard.tsx`) and the chat `fetch` (`ChatSidebar.tsx`), redirect to `/login` when the response status is 401.
- [ ] Optionally set `SESSION_SECRET` in `.env` so restarts do not end sessions, and mention it in `.env` setup docs.

### 6. Clearing a column title leaves the input empty

`ColumnTitle` in `KanbanColumn.tsx` keeps the edited value in local state and is reset only when `column.title` changes (`key={column.title}`). Clearing the title and leaving the field sends an empty rename, which fails (see #3), the board title is unchanged, so the input stays blank while the server still has the old name. It also sends a `PATCH` and a full board reload on every blur, even when nothing changed.

- [ ] On blur, if the trimmed value is empty or equal to `initialTitle`, restore `initialTitle` and skip the request.

### 7. AI output is not constrained to JSON

`openrouter.py` sends only `model` and `messages`. The system prompt asks for JSON, but nothing enforces it, and any reply wrapped in a Markdown code fence or prefixed with text fails validation and returns 502. The prompt also does not say that `position` is zero-based or that `operations` can be omitted.

- [ ] Send `response_format` with a JSON schema (OpenRouter structured outputs) generated from `AIOutput.model_json_schema(by_alias=True)`, and confirm with the smoke script that `openai/gpt-oss-120b` honors it.
- [ ] Add one sentence to the system prompt describing `position` and when to return no operations.

### 8. Default `npm run test:e2e` cannot pass

Without `PLAYWRIGHT_BASE_URL`, `playwright.config.ts` starts `next dev` on port 3000. The static-export frontend has no API proxy, so login and every board test fail there. `frontend/README.md` lists `npm run test:e2e` without this caveat.

- [ ] Make the Docker URL the default `baseURL` and remove the `webServer` block, or document clearly that the backend must be running. Combine with the isolated test database from #2.

## Low

### 9. No lockfile for backend dependencies

`backend/uv.lock` is not committed, and the Dockerfile runs `uv sync --no-dev` against version ranges, so each image build can pick different dependency versions. `COPY backend /app` also comes before `uv sync`, so any backend code change reinstalls all dependencies.

- [ ] Generate and commit `backend/uv.lock` (for example, `docker compose run --rm app uv lock`, then copy it out), and use `uv sync --locked --no-dev`.
- [ ] Copy `pyproject.toml` and `uv.lock` first, run `uv sync`, then copy the rest of `backend/` to keep the dependency layer cached. `tests/` can be excluded from the runtime image with `.dockerignore`.

### 10. Card position is computed outside a write lock

`create_card` and `_create_card_in_connection` read `count(*)` and then insert. SQLite starts a deferred transaction, so two concurrent requests (sync FastAPI routes run in a thread pool; for example a chat request and a board edit) can read the same count and the second insert fails on `UNIQUE(column_id, position)` with a 500. The frontend serializes its own board requests, so this is unlikely in practice.

- [ ] Open write transactions with `BEGIN IMMEDIATE` in `connect()` (for example, set `isolation_level="IMMEDIATE"`), which serializes writers with no other code changes.

### 11. No keyboard support for moving cards

`KanbanBoard.tsx` registers only `PointerSensor`. The cards get `role="button"` and `tabIndex` from dnd-kit but cannot be moved with the keyboard.

- [ ] Add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })`.

### 12. Schema DDL runs on every request

`initialize_database()` runs the full `CREATE TABLE IF NOT EXISTS` script on every login and every board read, through `get_or_create_board`.

- [ ] Call `initialize_database()` once from a FastAPI `lifespan` handler and remove the per-request calls. Tests that patch `DATABASE_PATH` would call it in their fixture.

### 13. `test_main.py` uses the real database volume

`docker compose run` mounts the `app-data` volume. Tests in `test_main.py` do not use the `database_path` fixture, so the login tests open `/app/data/project_management.db` and can create the user row there.

- [ ] Move the `database_path` fixture into `backend/tests/conftest.py` with `autouse=True`, which also removes the copy in each test file.

### 14. Cleanup

- [ ] Remove `GET /api/example` and its test; it was a Part 2 connectivity check. `GET /api/auth/session` is also unused by the frontend; keep it only if it is wanted for tests.
- [ ] Remove `backend/app/static/index.html` (the Part 2 placeholder); the Docker build replaces `app/static/` anyway.
- [ ] Stop tracking `frontend/test-results/.last-run.json` and add `test-results/` and `playwright-report/` to `frontend/.gitignore`.
- [ ] Remove `.vscode/settings.json` from the repository. It holds editor auto-approval rules from earlier agent sessions, including long one-off Playwright commands.
- [ ] Serve `favicon.ico` from the static export (it currently returns 404 because only `/`, `/login` and `/_next` are routed).
- [ ] Align `eslint-config-next` (16.1.6) with the installed `next` (16.3.6).
- [ ] Remove the unneeded `useMemo` for `cardsById` in `KanbanBoard.tsx`, and the second `require_authenticated` call in each mutation route in `main.py` (store the user id once).
- [ ] Add a minimal root `README.md`: prerequisites (Docker, `.env` with `OPENROUTER_API_KEY`), start/stop scripts, and test commands. `frontend/README.md` predates the Docker setup.

## What is working well

- Authentication keeps the password server-side, stores only an Argon2id hash, and uses an HTTP-only signed session cookie. Tests check that the password is never stored, returned or logged.
- Every board query is scoped to the authenticated user's board, and a test confirms another user's card cannot be changed.
- AI changes are validated against a strict, versioned Pydantic schema and applied in one transaction, and invalid output leaves the board unchanged.
- The backend is the single source of truth for the board, and the frontend serializes mutations and rolls back optimistic moves on failure.
- Automated tests never call OpenRouter, and the live smoke test is opt-in.
