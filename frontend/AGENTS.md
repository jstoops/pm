# Frontend Instructions

## Current Application

This directory contains the static-exported frontend. It uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, and `@dnd-kit` for sortable drag and drop. Pages are `/` (workspace), `/login`, `/register` and `/account`; FastAPI decides which page a visitor gets from the session.

- `src/app/page.tsx` renders `Workspace` at `/`.
- `src/components/Workspace.tsx` loads the session and board list, renders the navy top bar (account link, logout), `BoardSidebar`, and the selected board. The last opened board id is kept in `localStorage` as a convenience; board data never is.
- `src/components/BoardSidebar.tsx` lists boards with card counts (a horizontal strip on small screens) and creates boards.
- `src/components/KanbanBoard.tsx` owns one board's view state (keyed by board id), API-backed mutations, loading/error recovery, and drag/drop orchestration (pointer and keyboard). Its toolbar renames and deletes the board and toggles the assistant panel. It reports every server board to the workspace through `onBoardChange` so the sidebar stays current.
- `src/components/KanbanColumn.tsx` renders a column: inline title, card count, an actions menu (move left/right, delete), droppable region, and new-card form. Each column position has a stage icon and accent color (`columnStyles`, cycling after five), so the style stays with the position when a column is renamed.
- `src/components/AddColumnForm.tsx` adds a column at the end of the board. `src/components/InlineTitle.tsx` is the edit-in-place input shared by board and column titles.
- `src/components/KanbanCard.tsx` renders sortable cards with inline edit (title and details) and delete controls. Dragging is disabled while a card is being edited.
- `src/components/KanbanCardPreview.tsx` is used for the drag overlay.
- `src/components/NewCardForm.tsx` collects a title and optional details for a new card.
- `src/components/ChatSidebar.tsx` renders the AI conversation for one board, posts to `/api/boards/{id}/chat`, and returns AI board updates to `KanbanBoard`.
- `src/components/AuthShell.tsx` is the split layout shared by `/login` (`LoginForm`) and `/register` (`RegisterForm`). `src/components/FormField.tsx` is the shared labelled input.
- `src/components/AccountSettings.tsx` is the `/account` page: profile summary, password change, and account deletion.
- `src/lib/kanban.ts` defines `Card`, `Column`, `BoardData`, `BoardSummary`, and drag/drop move logic.
- `src/lib/api.ts` provides `apiRequest` (JSON fetch that redirects to `/login` on 401 and throws `ApiError` with the server's `detail`) and `jsonRequest`.
- `next.config.ts` enables Next.js static export. The root Dockerfile builds `out/` and copies it into FastAPI's static directory.

## Existing Behavior

- Registration creates the account with a seeded first board (five columns, sample cards) and signs in. New boards get the five default columns and no cards.
- Board and column names are editable in place (saved on blur or Enter). A blank or unchanged name is restored without a request.
- Deleting a board, or a column that has cards, asks for confirmation first.
- Cards can be created, edited, deleted, reordered within a column, and moved between columns with the pointer or the keyboard (Space to pick up, arrow keys to move, Space to drop).
- The backend is the runtime source of truth. Board changes persist in SQLite across reload, logout, and re-login; the browser does not store a competing board copy.
- The board assistant keeps its own bounded conversation in memory per board. A successful AI board update replaces the current board view with the backend response.

## Commands

Run commands from this directory:

```powershell
npm install
npm run lint
npm run test:unit
npm run test:coverage   # unit tests with the coverage gate from vitest.config.ts
npm run test:e2e
npm run test:all
npm run build
```

`npm run dev` serves the UI only; the static export has no API proxy, so board and login calls need the backend. Run the full app with the root `scripts/`.

## Testing

- Unit tests use Vitest and React Testing Library, next to each component (`*.test.tsx`) and in `src/lib/`. `src/test/fakeApi.ts` installs an in-memory fake of the board API as `fetch`; use it for workspace and board tests rather than hand-written response sequences.
- End-to-end tests use Playwright in `tests/kanban.spec.ts`. Each test registers its own user, so tests are isolated and run in parallel.
- `tests/global-setup.ts` starts a separate Docker Compose project (`pm-e2e`, port 8001) with its own volume and removes it, volume included, after the run. Tests never touch the real board data.
- Preserve stable accessible labels and `data-testid` values where practical because existing tests use them. Next.js renders a route announcer with `role="alert"`, so scope alert locators in Playwright (for example to `main`).

## Change Guidelines

- Maintain the existing project color variables and visual language unless a feature requires an intentional extension.
- Keep board domain types in `src/lib/kanban.ts` or a nearby focused module rather than duplicating types in components.
- Card and column ids come from the same database id namespace, so register drag and drop targets with the prefixed identifiers from `src/lib/kanban.ts` (`cardDragId`, `columnDropId`). Never pass a raw board id to dnd-kit.
- Make the backend the runtime source of truth; do not retain competing local board state as a second persistence mechanism.
- Use mocked HTTP responses in automated AI tests. Live OpenRouter calls belong only in an explicit manual smoke-test command.
- Links to `/` and other pages are plain `<a>` elements: FastAPI chooses the page from the session, so navigation must be a full page load.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
