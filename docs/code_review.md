# Code Review: Project Management MVP

Reviewed: `backend/app/*` (FastAPI, SQLite, OpenRouter), `frontend/src/*` (Next 16 static export, React 19, dnd-kit), Docker and scripts, tests, and `docs/`.

## Overall

The architecture is unusually disciplined for an MVP: one service layer (`apply_operations`) is the only code that writes board data, the backend is the single source of truth, card and column ids are namespaced for dnd-kit, and the e2e suite runs on an isolated Compose project. The findings below are mostly edge cases and consistency gaps, not structural problems.

## High

### 1. A failed column rename leaves the input showing the rejected title

`frontend/src/components/KanbanColumn.tsx:25` holds the title in local state, reset only by remounting through `key={column.title}`. `applyBoardChange` (`frontend/src/components/KanbanBoard.tsx:122`) is called without an optimistic board for renames, so on failure the board keeps the old title, the key does not change, the component is not remounted, and the input keeps the text the server just rejected. The header chips and the input then disagree until a reload.

Card edits do not have this problem: `setIsEditing(false)` re-renders from `card.title` in board state. Fix by passing the confirmed title down and reconciling on failure, or by restoring the previous value in the error path.

### 2. A failed card creation discards the user's typed input

`frontend/src/components/NewCardForm.tsx:13-21` closes the form and resets state immediately after calling `onAdd`, before the request resolves. On a 4xx or 5xx the title and details are gone and only the banner in `KanbanBoard` remains. `AGENTS.md` requires a recoverable state without losing valid input; the chat sidebar already does this correctly (`ChatSidebar.test.tsx:45`), the new-card form does not.

## Medium

### 3. `_write_column_order` bumps positions by a hardcoded `1000000`

`backend/app/database.py:273`. This is a magic-number workaround for the `UNIQUE(column_id, position)` constraint, and it silently breaks if a column ever holds a million cards. A two-pass renumber into a temporary range, or dropping the unique constraint in favour of a documented invariant, would be clearer.

### 4. `updated_at` is churned for untouched cards on every move

`backend/app/database.py:278` sets `updated_at = CURRENT_TIMESTAMP` for every card in both affected columns, including cards that did not move and did not change. `_board_data` does not return timestamps today, so there is no user-visible effect, but the column will be wrong the moment timestamps are exposed.

### 5. `GET /api/board` mutates the database and takes the write lock

`backend/app/database.py:118-120` runs `board_data` inside `transaction()`, which issues `BEGIN IMMEDIATE`, and `_board_id` creates and seeds a board on first read. A read endpoint that writes and serializes on the global SQLite write lock is a surprise for future maintainers and makes every board poll contend with board mutations. Reads could use a deferred transaction, and board creation could move to login.

### 6. Stale `previousBoard` rollback plus stale optimistic boards

`frontend/src/components/KanbanBoard.tsx:127`. `previousBoard` is captured from the render closure, and optimistic boards are built from that same stale `board`. If a drag is in flight and a later rename fails, the rollback restores the pre-drag board and discards the optimistic move. The server response is authoritative so the window is narrow, but the rollback path is the one place the client asserts a state it did not verify.

### 7. The card `<article>` is a `role="button"` containing two `<button>` elements

`frontend/src/components/KanbanCard.tsx:65-66` spreads dnd-kit `attributes` (which include `role` and `tabIndex`) onto the card and renders Edit and Delete buttons inside it. That is nested interactive content, which breaks screen-reader semantics and keyboard navigation order. Note also the asymmetry: `attributes` is conditional on `isEditing` but `listeners` is always spread. A dedicated drag handle button would fix both.

### 8. E2E and Compose require a root `.env` even though the tests need no API key

`compose.yaml:6-7` uses `env_file: .env` unconditionally, and `frontend/tests/global-setup.ts:8-13` brings the stack up through Compose. `PLAN.md` Part 8 and `AGENTS.md` both state that automated tests must run without a key, but `npm run test:e2e` fails outright on a clean checkout. Marking the file optional (`env_file: { path: .env, required: false }`) or injecting a placeholder in the e2e setup would match the documented contract.

### 9. Card and column ids share a namespace, and the collision guard is spread across three files

`frontend/src/lib/kanban.ts:18-32` is the right place for this and it is well tested, but the invariant is only documented in comments and `CLAUDE.md`. Every new droppable has to remember to prefix. A typed `DropTarget` returned from a single `useDroppable` wrapper would make the mistake impossible.

## Low

### 10. Board JSON is unbounded in the AI prompt

`backend/app/ai.py:53-65`. History is capped at 12 messages, but the entire board is serialised on every request with no column or card limit. A large board will silently inflate token cost and latency. A card cap per column in the prompt context would bound it.

### 11. Only `VerifyMismatchError` is caught during login

`backend/app/database.py:111-114`. A corrupt or non-Argon2 `password_hash` raises `VerificationError` or `InvalidHashError` and surfaces as a 500. No code path writes a bad hash today, so this is latent rather than live.

### 12. `SESSION_SECRET` and `DATABASE_PATH` are read at import time

`backend/app/main.py:36` and `backend/app/database.py:19`. Fine for the container, and the test fixture correctly monkeypatches the module global, but neither can be changed after startup. Worth a comment so nobody tries to set them in a lifespan hook.

### 13. Dead columns: `boards.updated_at` and `users.updated_at` are never updated

Both tables define `updated_at` and nothing in `database.py` writes it. `docs/DATABASE.md:21` describes `users.updated_at` as tracking password changes, which no code path does.

### 14. `MAX_HISTORY_MESSAGES` is duplicated as a literal `12` in the frontend

`backend/app/ai.py:10` against `frontend/src/components/ChatSidebar.tsx:40` (`messages.slice(-12)`). The backend is the authority; the client literal is an invisible coupling.

### 15. Order-dependent e2e tests sharing one board

`frontend/tests/kanban.spec.ts`. `resetCards` deletes every card on the board, and the AI test permanently renames column 1 to "AI Backlog" without restoring it. The isolation is correct (own Compose project, own volume, `workers: 1`), but the suite passes only in its current declaration order, and a shared rename/reset helper would make failures easier to read.

### 16. The test-only extra sync happens at run time

`Dockerfile:28` installs with `uv sync --locked --no-dev`, so the documented `uv run --group test pytest` re-syncs and installs the test group inside the container, requiring network at test time. Baking a test stage, or documenting the requirement, would remove the surprise.

### 17. `LoginForm` reports every non-2xx as bad credentials

`frontend/src/components/LoginForm.tsx:33-35`. A 500 or an offline failure tells the user to check their username and password, which sends them the wrong way.

### 18. AI operations can delete cards with no confirmation or scope limit

`docs/AI_SCHEMA.md:34` documents that any valid operation is applied. Combined with board content flowing into the prompt, a user can be talked into a bulk delete. Acceptable for a local MVP, but the AI path is worth distinguishing from direct user edits at some point.

## What is good and should not be lost

- `apply_operations` as the single write path, with `BEGIN IMMEDIATE` and rollback, is the right call and is exercised by real cross-user tests (`backend/tests/test_board_api.py:111`).
- The dnd-kit id namespacing with `cardDragId` and `columnDropId`, plus `frontend/src/lib/kanban.test.ts` cases that deliberately use colliding ids, is a genuinely careful piece of design.
- `frontend/tests/global-setup.ts` isolating e2e onto its own Compose project and volume is the right answer to "tests must not touch real data."
- `redirectIfUnauthorized` centralising the expired-session redirect, and the pointer-only `collisionDetection` in `frontend/src/components/KanbanBoard.tsx:33`, are both documented at the point of complexity.
- Test coverage of the awkward cases (foreign card ids, blank titles, malformed AI output, colliding ids) is well above typical MVP depth.

## Suggested order

1. Items 1 and 2: both are user-visible data loss, both are small fixes with existing test patterns to copy.
2. Item 8: one-line Compose change, unblocks `npm run test:e2e` on a clean checkout.
3. Item 7: accessibility fix, contained to one component.
4. Items 3, 4, 5: backend cleanups, each independently testable.
5. Items 9 through 18 as opportunistic.
