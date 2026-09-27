# Frontend Instructions

## Current Application

This directory contains the static-exported Kanban frontend. It uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, and `@dnd-kit` for sortable drag and drop. It has a server-managed login flow but no board API client or persistence yet.

- `src/app/page.tsx` renders `KanbanBoard` at `/`.
- `src/components/KanbanBoard.tsx` owns in-memory board state and drag/drop orchestration.
- `src/components/KanbanColumn.tsx` renders a fixed board column, inline title input, droppable region, and new-card form.
- `src/components/KanbanCard.tsx` renders sortable cards and deletion controls.
- `src/components/KanbanCardPreview.tsx` is used for the drag overlay.
- `src/components/NewCardForm.tsx` collects a title and optional details for a new card.
- `src/lib/kanban.ts` defines `Card`, `Column`, `BoardData`, seed data, move logic, and client-side ID generation.
- `next.config.ts` enables Next.js static export. The root Dockerfile builds `out/` and copies it into FastAPI's static directory.
- `src/app/login/page.tsx` and `src/components/LoginForm.tsx` provide the login experience; the form posts credentials to `/api/auth/login` and relies on the HTTP-only session cookie set by the backend.

## Existing Behavior

- The board has five seeded columns: Backlog, Discovery, In Progress, Review, and Done.
- Column names are editable in place.
- Cards can be created, deleted, reordered within a column, and moved between columns.
- Board changes are cached in `sessionStorage` for the active browser session, including across logout and re-login; persistence moves to the backend in Part 7.
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
- End-to-end tests use Playwright in `tests/kanban.spec.ts` and cover protected entry, login, card creation, drag/drop movement, and logout.
- Set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8000` to run Playwright against the Docker-served application instead of a local Next.js development server.
- Preserve stable accessible labels and `data-testid` values where practical because existing tests use them.

## Change Guidelines

- Maintain the existing project color variables and visual language unless a feature requires an intentional extension.
- Keep board domain types in `src/lib/kanban.ts` or a nearby focused module rather than duplicating types in components.
- When persistence is introduced, make the backend the runtime source of truth; do not retain competing local board state as a second persistence mechanism.
- Use mocked HTTP responses in automated AI tests. Live OpenRouter calls belong only in an explicit manual smoke-test command.