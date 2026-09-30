# Project Management MVP Plan

## Delivery Rules

- Work through the parts in order. A part is complete only when its checklist, tests, and success criteria are satisfied.
- Do not begin Part 2 until the user formally approves this plan.
- Do not begin Part 6 until the user formally approves the database design from Part 5.
- Keep credentials and `.env` files out of source control and browser bundles.
- Automated AI tests must mock OpenRouter HTTP responses. A separate opt-in manual smoke-test command will make the live `2+2` request.

## Part 1: Plan and Frontend Inventory

- [x] Review the root project requirements.
- [x] Review the existing frontend application, test setup, and board behavior.
- [x] Create `frontend/AGENTS.md` documenting the existing frontend structure and conventions.
- [x] Expand this document into implementation checklists, test expectations, and success criteria.
- [x] Obtain formal user approval of this plan before starting Part 2.

### Tests

- Confirm documentation accurately identifies the current frontend commands and behavior.

### Success Criteria

- This plan has formal user approval.
- The frontend-specific instructions accurately describe the existing demo and its tests.

## Part 2: Docker, FastAPI, and Local Scripts

- [x] Inspect backend and script-specific instructions before making changes in those directories.
- [x] Create the Python project metadata for `uv` and FastAPI in `backend/`.
- [x] Implement a minimal FastAPI application with a health endpoint and an example API endpoint.
- [x] Configure the backend to serve a temporary static hello-world page at `/`.
- [x] Create a Dockerfile and Docker configuration that install Python dependencies with `uv` and expose the application port.
- [x] Add documented start and stop scripts for Windows, macOS, and Linux in `scripts/`.
- [x] Ensure scripts load root `.env` values without exposing them in output.

### Tests

- [x] Backend unit test: health endpoint returns a successful response.
- [x] Backend unit test: example API endpoint returns its documented JSON response.
- [x] Container smoke test: build the image, start it, request `/` and the example API endpoint, then stop it.

### Success Criteria

- A single Docker container starts locally using the platform-appropriate script.
- `/` returns the temporary static page and the API endpoint responds successfully.
- The container can be stopped by the corresponding stop script.

## Part 3: Serve the Existing Frontend

- [x] Configure Next.js for a static production export compatible with FastAPI static-file serving.
- [x] Update Docker build stages to install frontend dependencies, create the static export, and copy only the built assets to the runtime image.
- [x] Replace the temporary root page with the existing Kanban application.
- [x] Configure FastAPI static serving and fallback behavior required by the exported frontend.
- [x] Preserve the existing board's five columns, renaming, card creation/deletion, and drag/drop behavior.

### Tests

- [x] Run existing frontend unit tests.
- [x] Run existing Playwright board tests against the container-served application.
- [x] Add an integration check that `/` is served by FastAPI and displays the Kanban heading.

### Success Criteria

- The Docker-served root route displays the existing Kanban demo.
- All existing frontend unit and end-to-end behavior passes in the packaged application.

## Part 4: MVP Authentication

- [x] Define a minimal server-managed authentication mechanism suitable for the local MVP.
- [x] Implement a login endpoint accepting only `user` and `password`.
- [x] Store authenticated state in a secure session mechanism; do not place the password in frontend code or storage.
- [x] Gate board routes and board API access behind authentication.
- [x] Add a login view matching the existing visual language.
- [x] Add logout and return the user to the login view.
- [x] Preserve Kanban data in memory for the authenticated browser session.

### Tests

- [x] Backend unit tests for successful login, rejected credentials, authenticated access, unauthenticated rejection, and logout.
- [x] Frontend tests for login form validation and logout controls.
- [x] Playwright flow for login, board visibility, logout, and protected-route behavior.
- [x] Playwright test that board changes survive a page reload within the browser session.

### Success Criteria

- Visiting `/` while unauthenticated presents login.
- `user` / `password` grants access to the board.
- Logout removes board access until the user logs in again.
- Board changes remain available after a reload and re-login through SQLite persistence.

## Part 5: Database Design Approval

- [x] Propose a SQLite schema supporting multiple users and one board per user.
- [x] Model board columns, cards, ordering, and timestamps needed for persistent edits.
- [x] Define how the initial board is created for a new user.
- [x] Define JSON representations used by the API and AI features.
- [x] Document schema, migration/initialization approach, constraints, and example payloads in `docs/`.
- [x] Obtain formal user approval before implementing persistence.

### Tests

- Validate proposed example JSON against the documented API model.
- Review schema constraints against one-board-per-user and ordered-column/card requirements.
- Define Part 6 tests that prove plaintext passwords are neither persisted, logged, nor returned, and that password hashes verify securely.

### Success Criteria

- The user formally approves the database design document.
- The design supports the MVP and does not preclude future multiple-user operation.

## Part 6: Persistent Kanban API

- [x] Add SQLite database initialization that creates the database and schema when absent.
- [x] Add data-access code for the authenticated user's single board.
- [x] Implement API routes to read and change board columns, cards, membership, and order.
- [x] Validate request payloads and return clear errors for invalid or unauthorized operations.
- [x] Ensure every route operates only on the authenticated user's board.

### Tests

- [x] Unit tests using an isolated temporary SQLite database for initialization and first-board creation.
- [x] API tests for reads, column rename, card create/update/delete, card move/reorder, validation failures, and authentication boundaries.
- [x] Test that changes remain after a new application/database session.
- [x] Test that passwords are Argon2id-hashed before persistence and are never stored, returned, or logged as plaintext.
- [x] Test that the frontend does not retain passwords in browser storage; require HTTPS for non-local authentication traffic.

### Success Criteria

- The database is created automatically when missing.
- API changes persist and are returned in the board's documented JSON format.
- One user's data cannot be read or changed through another user's session.

## Part 7: Frontend Persistence Integration

- [x] Load the board from the authenticated backend API rather than `initialData` at runtime.
- [x] Replace local-only mutations with API-backed column and card operations.
- [x] Handle loading, save failures, and retryable user feedback without losing a valid board state.
- [x] Keep drag/drop responsive while preserving the server's resulting order.
- [x] Resolve card drop targets from the pointer position, selecting the card below the pointer or the hovered column when no card is below it.
- [x] Retain the static demo data only as server-side initial-board seed data, if required.

### Tests

- [x] Frontend unit tests mock board API responses for loading, successful mutation, and failure states.
- [x] Backend integration tests cover the API contract consumed by the UI.
- [x] Playwright tests verify an edit survives reload and a moved card remains in its new column.
- [x] Playwright regression tests verify cross-column and same-column drops above, and between, the top two cards of a column persist in the intended position.

### Success Criteria

- All board edits made through the UI persist across a browser reload.
- The UI displays a clear, recoverable state when an API operation fails.
- Dragging a card above or between the top two cards of a column preserves the intended order after reload.

## Part 8: OpenRouter Connectivity

- [x] Decision: validate connectivity with an explicit, live OpenRouter request rather than mocked HTTP tests. The smoke test must run in Docker and send `2+2` to the configured model.
- [x] Add backend-only OpenRouter configuration using `OPENROUTER_API_KEY` and model `openai/gpt-oss-120b`.
- [x] Implement an OpenRouter client with timeouts and actionable error handling.
- [x] Add an opt-in manual smoke-test command that sends `2+2` to OpenRouter and reports the response without printing credentials.
- [x] Keep the smoke-test command separate from the normal automated test suite.

### Tests

- [x] The explicit smoke-test command makes a live request; it does not mock OpenRouter HTTP responses.
- Windows: run `./scripts/smoke-openrouter.ps1`. macOS/Linux: run `./scripts/smoke-openrouter.sh`.
- [x] Manual smoke test: with a valid root `.env`, the explicit command returned `4` from `openai/gpt-oss-120b` on 2026-09-29.

### Success Criteria

- Automated tests run without network access or an API key.
- The documented manual smoke-test command confirms live OpenRouter connectivity when intentionally invoked.

## Part 9: AI Board Commands and Structured Output

- [ ] Define a versioned structured response schema containing assistant text and an optional complete or patch-style board update.
- [ ] Include the current board JSON, authenticated user's question, and bounded conversation history in each model request.
- [ ] Validate model output against the schema before persisting any board change.
- [ ] Apply valid AI-requested changes through the same service layer used by board APIs.
- [ ] Reject invalid, unauthorized, or malformed AI changes without altering the board.

### Tests

- Mocked OpenRouter tests for conversational replies without updates, valid card/column updates, multiple updates, and malformed output.
- Database/API tests confirm valid AI updates persist atomically and invalid updates make no changes.
- Test the request payload includes current board state and bounded history.

### Success Criteria

- The backend returns validated assistant text and, when appropriate, a persisted updated board.
- No model response can mutate data unless it conforms to the documented structured schema.

## Part 10: AI Chat Sidebar

- [ ] Design and implement a responsive sidebar integrated with the authenticated board workspace.
- [ ] Display conversation history, message submission, pending state, errors, and assistant responses.
- [ ] Send chat requests to the authenticated backend endpoint.
- [ ] Refresh board state from the API after a successful AI-driven update.
- [ ] Ensure the desktop sidebar and mobile presentation preserve access to both chat and board controls.

### Tests

- Component tests for message submission, loading, error, and assistant-response states.
- Mocked integration tests for chat responses with and without board updates.
- Playwright tests verify that an AI update is reflected in the board without a manual reload.

### Success Criteria

- A signed-in user can hold a chat conversation from the board workspace.
- Valid AI changes are visible on the board immediately after the response.
- The completed application runs locally in Docker and all automated checks pass without live AI calls.