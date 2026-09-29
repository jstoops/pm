# Frontend Instructions

## Current Application

This directory contains the static-exported Kanban frontend. It uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, and `@dnd-kit` for sortable drag and drop. It has a server-managed login flow and loads the board from the authenticated backend API.

- `src/app/page.tsx` renders `KanbanBoard` at `/`.
- `src/components/KanbanBoard.tsx` owns the loaded board view state, API-backed mutations, loading/error recovery, and drag/drop orchestration.
- `src/components/KanbanColumn.tsx` renders a fixed board column, inline title input, droppable region, and new-card form.
- `src/components/KanbanCard.tsx` renders sortable cards and deletion controls.
- `src/components/KanbanCardPreview.tsx` is used for the drag overlay.
- `src/components/NewCardForm.tsx` collects a title and optional details for a new card.
- `src/lib/kanban.ts` defines `Card`, `Column`, `BoardData`, and drag/drop move logic.
- `next.config.ts` enables Next.js static export. The root Dockerfile builds `out/` and copies it into FastAPI's static directory.
- `src/app/login/page.tsx` and `src/components/LoginForm.tsx` provide the login experience; the form posts credentials to `/api/auth/login` and relies on the HTTP-only session cookie set by the backend.

## Existing Behavior

- New users receive five seeded columns: Backlog, Discovery, In Progress, Review, and Done from the backend database.
- Column names are editable in place.
- Cards can be created, deleted, reordered within a column, and moved between columns.
- The backend is the board's runtime source of truth. Board changes persist in SQLite across reload, logout, and re-login; the browser does not store a competing board copy.
- The board is accessible only after the backend accepts `user` / `password`; logout posts to `/api/auth/logout` and returns to the login page.

## Commands

Run commands from this directory:

```powershell
npm install
npm run dev
npm run lint
npm run test:unit
npm run test:e2e
npm run test:all
npm run build
```

## Testing

- Unit tests use Vitest and React Testing Library. Board component tests are in `src/components/KanbanBoard.test.tsx`, login component tests are in `src/components/LoginForm.test.tsx`, and board utility tests are in `src/lib/kanban.test.ts`.
- End-to-end tests use Playwright in `tests/kanban.spec.ts` and cover protected entry, login, persisted card creation, persisted drag/drop movement, and logout.
- Set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000` to run Playwright against the Docker-served application instead of a local Next.js development server.
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
