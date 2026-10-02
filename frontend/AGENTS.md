# Frontend Instructions

## Current Application

This directory contains the static-exported Kanban frontend. It uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, and `@dnd-kit` for sortable drag and drop. It has a server-managed login flow and loads the board from the authenticated backend API.

- `src/app/page.tsx` renders `KanbanBoard` at `/`.
- `src/components/KanbanBoard.tsx` owns the loaded board view state, API-backed mutations, loading/error recovery, and drag/drop orchestration (pointer and keyboard). It renders a full-viewport shell on large screens: a navy top bar, columns that share the available width (scrolling horizontally only when they no longer fit), and the assistant panel, which the top bar toggle can hide to give the board the full width.
- `src/components/KanbanColumn.tsx` renders a fixed board column, inline title input, droppable region, and new-card form. Each column position has a stage icon and accent color from the project palette (`columnStyles`), so the style stays with the position when a column is renamed.
- `src/components/KanbanCard.tsx` renders sortable cards with inline edit (title and details) and delete controls. Dragging is disabled while a card is being edited.
- `src/components/KanbanCardPreview.tsx` is used for the drag overlay.
- `src/components/NewCardForm.tsx` collects a title and optional details for a new card.
- `src/components/ChatSidebar.tsx` renders the AI conversation, sends authenticated requests to `/api/chat`, and returns AI board updates to `KanbanBoard`.
- `src/lib/kanban.ts` defines `Card`, `Column`, `BoardData`, and drag/drop move logic.
- `src/lib/api.ts` redirects to `/login` when an API call returns 401 (expired session).
- `next.config.ts` enables Next.js static export. The root Dockerfile builds `out/` and copies it into FastAPI's static directory.
- `src/app/login/page.tsx` and `src/components/LoginForm.tsx` provide the login experience; the form posts credentials to `/api/auth/login` and relies on the HTTP-only session cookie set by the backend.

## Existing Behavior

- New users receive five seeded columns: Backlog, Discovery, In Progress, Review, and Done from the backend database.
- Column names are editable in place. A blank or unchanged name is restored without a request.
- Cards can be created, edited, deleted, reordered within a column, and moved between columns with the pointer or the keyboard (Space to pick up, arrow keys to move, Space to drop).
- The backend is the board's runtime source of truth. Board changes persist in SQLite across reload, logout, and re-login; the browser does not store a competing board copy.
- The board is accessible only after the backend accepts `user` / `password`; logout posts to `/api/auth/logout` and returns to the login page.
- The board assistant keeps its own bounded conversation in memory. A successful AI board update replaces the current board view with the backend response; it is never stored separately in the browser.

## Commands

Run commands from this directory:

```powershell
npm install
npm run lint
npm run test:unit
npm run test:e2e
npm run test:all
npm run build
```

`npm run dev` serves the UI only; the static export has no API proxy, so board and login calls need the backend. Run the full app with the root `scripts/`.

## Testing

- Unit tests use Vitest and React Testing Library. Board component tests are in `src/components/KanbanBoard.test.tsx`, login component tests are in `src/components/LoginForm.test.tsx`, and board utility tests are in `src/lib/kanban.test.ts`.
- End-to-end tests use Playwright in `tests/kanban.spec.ts` and cover protected entry, login, persisted card creation and editing, persisted pointer and keyboard drag/drop movement, expired sessions, and logout.
- `tests/global-setup.ts` starts a separate Docker Compose project (`pm-e2e`, port 8001) with its own volume and removes it, volume included, after the run. Tests never touch the real board data. They share one user's board, so they run with one worker.
- Preserve stable accessible labels and `data-testid` values where practical because existing tests use them.

## Change Guidelines

- Maintain the existing project color variables and visual language unless a feature requires an intentional extension.
- Keep board domain types in `src/lib/kanban.ts` or a nearby focused module rather than duplicating types in components.
- Card and column ids come from the same database id namespace, so register drag and drop targets with the prefixed identifiers from `src/lib/kanban.ts` (`cardDragId`, `columnDropId`). Never pass a raw board id to dnd-kit.
- When persistence is introduced, make the backend the runtime source of truth; do not retain competing local board state as a second persistence mechanism.
- Use mocked HTTP responses in automated AI tests. Live OpenRouter calls belong only in an explicit manual smoke-test command.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
