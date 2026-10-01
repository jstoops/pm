# Code review: Project Management MVP

Reviewed on 2026-10-01. Scope: the current project, not only a recent diff.

## Conclusion

The architecture fits the local MVP: a static Next.js frontend, authenticated FastAPI routes, SQLite persistence, and a shared transactional board-operation service. The existing tests pass in the environments described below. However, **network exposure, stale AI commands, asynchronous board reconciliation, and failed-save recovery need correction before relying on the app for important board data**.

This review identifies **2 high-priority, 7 medium-priority, and 2 low-priority findings**. Each includes evidence and a regression-test recommendation. Application code was not changed. This report supersedes the earlier review; unsupported claims from that review are not carried forward as defects.

## Scope and verification

Reviewed backend application and tests; frontend components, state utilities, styles, routing and tests; Docker/Compose; Windows and Unix scripts; dependency declarations and lockfile usage; repository guidance; and the plan, database and AI-schema documentation. Generated assets and third-party dependencies were not audited line by line. No live credentials were inspected, no live OpenRouter requests were made, and no existing board database was changed.

| Check | Result |
| --- | --- |
| Frontend `npm run lint` | Passed. |
| Frontend `npm run test:unit` | 26 tests passed across 4 files. |
| Frontend `npm run build` | Passed, including TypeScript and static export. |
| Backend existing pytest suite | 13 tests passed; one pytest import-rewrite warning. |
| Temporary frontend reproductions | 3 checks confirmed lost queued results, stale manual/AI response ordering, and failed create/edit/rename behavior. These checks asserted the observed bugs, not the desired behavior. |
| Isolated backend reproductions | Confirmed stale AI overwrite, deletion of a replacement card after ID reuse, boolean-ID coercion, and uncaught empty OpenRouter choices. |
| Compose configuration | Parsed successfully. Published app port has no host-IP restriction. |
| Unix executable metadata | All three `.sh` scripts are tracked as mode `100644`, not executable. |
| `npm run test:e2e` | Blocked in global setup: Docker Desktop's Linux daemon was unavailable. No browser tests ran. |

Backend verification used an isolated Windows Python 3.14.5 environment installed from `backend/uv.lock` with `uv sync --locked --group test`. The test process pointed `main.STATIC_DIRECTORY` at the freshly built `frontend/out`; each test used a temporary SQLite database. This verifies backend logic and exported page responses, **not** the Python 3.13 Docker image, its mounts, or its complete static-serving configuration. Docker build/start/stop, native macOS/Linux execution, real browser drag behavior, and screen-reader behavior remain unverified in this review. No external vulnerability-advisory audit was performed.

## High-priority findings

### 1. Compose exposes the hardcoded-login app beyond localhost

**Location:** `compose.yaml:8-9`; `backend/app/main.py:37-52`; `README.md:19-23`.

The port mapping `${APP_PORT:-8000}:8000` does not bind a host address. Docker normally publishes it on all host interfaces, although actual remote reachability also depends on the host firewall and Docker configuration. The application uses the publicly documented `user` / `password` login and defaults to HTTP without secure-only cookies.

**Impact:** A machine that permits inbound access can expose the board and AI endpoint to other network users. Those users can authenticate with the documented credentials, modify/delete cards, and send requests using the configured OpenRouter key. This contradicts the local-only security assumption; hardcoded credentials themselves are an explicit MVP choice.

**Recommendation:** Bind the published port to loopback, for example `127.0.0.1:${APP_PORT:-8000}:8000`. Keep Uvicorn listening on all interfaces *inside* the container. Treat any future remote-access configuration as a separate deployment requiring real authentication and TLS.

**Regression check:** Assert the resolved Compose port includes `host_ip: 127.0.0.1`, then verify localhost access and lack of LAN access on a Docker-capable host.

### 2. Delayed AI operations can overwrite newer work or delete an unrelated replacement card

**Location:** `backend/app/ai.py:52-74`; `backend/app/database.py:123-179`, and the `cards.id INTEGER PRIMARY KEY` declaration.

The AI path reads the board, releases its transaction, calls OpenRouter, and later applies operations in a new transaction without checking whether the board changed. Transactional application prevents partial updates, but does not make the original snapshot current.

**Reproduced sequences:**

1. AI reads a column title; a manual request renames it while OpenRouter is pending; AI's later rename silently overwrites the manual edit.
2. AI reads the highest-ID card; a manual delete removes that card; a new card is created. SQLite's ordinary `INTEGER PRIMARY KEY` allocation can reuse the deleted highest ID. The pending AI delete then removes the new, unrelated card. This was reproduced with the real board service and a mocked OpenRouter response.

**Recommendation:** Compare the prompt's board snapshot or an explicit board revision against current data *inside the write transaction* before applying AI operations. Reject stale commands with a clear retry/conflict response. Do not hold the SQLite write lock across the network call. Preventing ID reuse alone would not fix stale edits or moves.

**Regression tests:** Pause a mocked model call, perform an intervening manual mutation, resume it, and assert no AI changes persist. Cover rename conflicts and delete/create ID reuse. Test through the API as well as the service.

## Medium-priority findings

### 3. A later failed request hides an earlier successful queued save

**Location:** `frontend/src/components/KanbanBoard.tsx:122-152`.

`boardChangeId` advances when requests are queued, not when they succeed. Responses for all but the newest queued request are discarded. If the newest request fails, an earlier successful response is never reconciled into the displayed board.

**Reproduction:** Delay a rename of column A, then submit a rename of column B. Resolve A successfully and reject B. The database contains A's rename, but the header chips retain A's old name while the banner says the board is unchanged. A temporary component test confirmed this independently of chat and drag/drop.

**Recommendation:** Retain the latest confirmed server state and reconcile it when the queue settles, including failure paths. Alternatively refetch the board after failed queued operations. Avoid restoring a render-time snapshot as if it were confirmed server state.

**Regression tests:** Earlier success followed by later failure; earlier failure followed by later success; two failures after optimistic movement. Assert visible content and order, not merely the error banner.

### 4. Chat updates bypass manual-mutation ordering and can be replaced by stale responses

**Location:** `frontend/src/components/KanbanBoard.tsx:140-149,321-325`; `frontend/src/components/ChatSidebar.tsx:53-55`.

Chat sets board state directly without participating in the manual mutation queue or change counter.

**Reproduction:** Let a manual rename commit but delay delivery of its response. Let a subsequent AI edit return its newer board first. Deliver the older manual response: the AI edit disappears from the displayed board. A temporary component test confirmed this. An optimistic move's failure rollback can similarly restore state from before a chat update.

**Impact:** The UI diverges from persisted data until another successful refresh. This is distinct from finding 2: the server may be completely correct while the browser renders an older response.

**Recommendation:** Coordinate chat and manual board mutations through one ordering/reconciliation mechanism. A simple MVP option is to serialize them together; otherwise use server revisions and reconcile with a fresh board after overlapping requests settle. Merely incrementing a client counter does not establish server commit order.

**Regression tests:** Delay a manual response until after an AI response, then exercise both manual success and failure. Also test the reverse response order.

### 5. Failed card creation and editing discard the user's draft

**Location:** `frontend/src/components/NewCardForm.tsx:13-20`; `frontend/src/components/KanbanCard.tsx:36-50`; `frontend/src/components/KanbanBoard.tsx:201-215`.

Creation clears both fields and closes immediately after calling a void callback. Editing also closes before the request finishes; reopening resets its state from the unchanged saved card. Neither form can observe whether persistence succeeded because the parent discards the mutation promise and catches errors internally.

**Reproduction:** Fill a card title/details and return HTTP 500 for POST or PATCH. The draft is no longer recoverable through the form. Both paths were reproduced in a component check. Overlong values are another realistic trigger: the browser fields do not enforce the backend's title/details limits.

**Recommendation:** Propagate an explicit success/failure result through the mutation callbacks. Keep the form and draft on failure; clear/close only after success. Disable duplicate submission while pending. Matching client-side length limits would also make validation failures understandable.

**Regression tests:** Reject creation and editing, assert both input values survive, then retry successfully. Include backend length-limit rejection, not just a network error.

### 6. A failed column rename still looks saved in the column input

**Location:** `frontend/src/components/KanbanColumn.tsx:24-38,75-80`; `frontend/src/components/KanbanBoard.tsx:193-199`.

The title input owns local state and resets only when its key, the confirmed column title, changes. A rejected rename leaves that key unchanged and preserves the rejected text. The input and header chip therefore disagree.

**Reproduction:** Enter a new column title, blur, and return HTTP 500. The input still displays the new value; the server and header retain the old value. Confirmed by a temporary component check. The existing failed-save test only checks the banner and column count.

**Recommendation:** Return the rename result to the input and either restore the confirmed title on failure or visibly retain an unsaved draft with a retry action.

**Regression test:** Assert the input, header chip, saved title, and failure indication agree after rejection and after retry.

### 7. AI validation coerces boolean identifiers into real card IDs

**Location:** `backend/app/operations.py:21-48`; `backend/app/ai.py:23-26,67`.

Pydantic's default integer coercion accepts `true` as `1`; extra properties are also silently ignored. This is not just a cosmetic mismatch with the documented numeric-ID contract.

**Reproduction:** Return an otherwise valid model response containing `{"type":"delete_card","cardId":true,"unexpected":"ignored"}`. It validates and deletes card 1. This was confirmed against an isolated database. Ownership checks still apply, so this is not a cross-user authorization bypass.

**Recommendation:** Make identifiers and positions strict integers, and reject extra fields in the AI envelope and operation models. Ensure nested operation models enforce these constraints too. Keep the generated JSON schema consistent with runtime validation.

**Regression tests:** Boolean and string identifiers, string positions, and unknown fields must reject the complete batch without changing the database. Include a valid operation before an invalid one to verify atomic rejection.

### 8. The documented Unix start/stop commands are not executable in a fresh checkout

**Location:** Git executable metadata for `scripts/start.sh`, `scripts/stop.sh`, and `scripts/smoke-openrouter.sh`; `README.md:20-23`; `docs/PLAN.md` Part 8.

All three shell scripts are tracked as mode `100644`. On a normal Linux/macOS checkout, invoking them directly as documented fails with permission denied before Docker is called. Their shebangs do not confer executable permission.

**Recommendation:** Record mode `100755` for these scripts, or consistently document invocation through `sh`. Setting executable metadata is the smaller fix for the existing usage.

**Regression check:** Inspect `git ls-files -s scripts` and run the documented commands on a Unix checkout. This review verified metadata, not native Unix execution.

### 9. The whole sortable card is an interactive control containing other controls

**Location:** `frontend/src/components/KanbanCard.tsx:54-67,113-130`.

The card article receives dnd-kit button-role/focus attributes while containing independent Edit and Delete buttons. This creates nested interactive semantics and an unnecessarily broad drag activator. The existing keyboard-move test demonstrates one supported drag sequence, but does not establish correct assistive-technology behavior for the nested controls.

**Recommendation:** Give dragging a dedicated, named handle button with the activator ref, attributes and listeners; leave the containing article non-interactive. Keep Edit and Delete as separate sibling controls.

**Regression checks:** Inspect the accessibility tree and tab order, activate Edit/Delete independently, and verify keyboard pickup, movement, drop and cancellation through the handle. The markup concern is supported by source inspection; screen-reader impact was not tested here.

## Low-priority findings

### 10. An empty OpenRouter choices array escapes the error-handling boundary

**Location:** `backend/app/openrouter.py:31-44`; `backend/app/ai.py:67-69`.

`response.json()["choices"][0]` raises `IndexError` for `{"choices":[]}`. The client catches other malformed-response exceptions but not this one, so the chat route produces an unhandled server error instead of its intended controlled upstream error. The live smoke command likewise escapes its friendly `OpenRouterError` handler.

**Evidence:** A mocked HTTP 200 response with an empty choices array reproduced the uncaught `IndexError`. No claim is made that the live provider currently emits this response.

**Recommendation:** Validate that a choice exists before indexing, or include this shape in the malformed-response handling. Add direct mocked tests of the HTTP client; existing AI tests replace `ask_openrouter` entirely and cannot catch this.

### 11. HTTP server failures during login are mislabeled as bad credentials

**Location:** `frontend/src/components/LoginForm.tsx:33-40`.

Every non-successful HTTP response shows "Check your username and password," including HTTP 500 and 503. Fetch/network exceptions already get the more accurate unavailable message; the earlier review incorrectly grouped them with this problem.

**Recommendation:** Use the credentials message for HTTP 401 and the unavailable/retry message for server failures.

**Regression tests:** Distinguish HTTP 401, HTTP 503, and rejected fetch responses. This finding is based on the explicit response branch, not a live outage.

## Other observations and limits

- **Test setup requires a root `.env` file.** `compose.yaml:6-7` makes it mandatory, including for the isolated e2e stack. An empty file is sufficient for mocked AI tests; an API key is not inherently required. Consider an optional env file or a documented test-only setup. Do not describe this as proof that automated tests require a live key.
- **Failed e2e setup can leave resources behind.** `frontend/tests/global-setup.ts:15-17` only returns teardown after `up --wait` succeeds. If startup partially succeeds then fails its health check, the disposable project may remain. Add cleanup on setup failure, scoped strictly to `pm-e2e`. This failure sequence was not exercised because the daemon was unavailable.
- **Accessibility follow-up:** New-card fields rely on placeholders rather than explicit labels (`NewCardForm.tsx:27-43`). Add persistent accessible labels alongside the drag-handle work. Browser/screen-reader behavior needs verification.
- **AI context is not size-bounded by board size.** History and operation counts are bounded, but every card is sent. Monitor this if boards grow; silently truncating cards would remove context the assistant needs and is not automatically the right fix.
- **SQLite maintenance is lower priority for this MVP.** Read transactions deliberately acquire the write lock and seed on first access, as documented. The fixed ordering offset of 1,000,000 has a theoretical large-column collision boundary; ordinary MVP-sized boards did not demonstrate a failure. Card timestamps are updated during reordering and board timestamps are not maintained. Clarify timestamp semantics before using them for user-facing history or revisions.
- **Production security remains outside the stated deployment model.** Signed-cookie sessions, hardcoded credentials, and no server-side session revocation are not a production authentication system. Preserve the local-only boundary rather than interpreting the passing authentication tests as production readiness.
- **Dependency installation and AI runtime are separate concerns.** The image installs locked runtime dependencies, while the documented backend test command installs the test group at execution time. Dependency installation may require network access even though the tests themselves mock AI. Frontend builds also obtain Google fonts. The live structured-output provider path was not exercised.

## Existing strengths and corrections to the previous review

- `apply_operations` centralizes REST and AI writes, checks board ownership, and rolls back invalid batches. Keep this service boundary.
- Argon2 password hashing, HTTP-only signed cookies, protected board routes, and temporary-database tests provide useful MVP safeguards. SQL mutations use bound parameters; board/chat text is rendered as React text rather than injected HTML.
- Prefixed drag/drop IDs correctly separate colliding card and column numbers. A new wrapper abstraction is not justified solely because callers must use these existing helpers.
- The e2e Compose project and volume are separate from normal app data. The AI browser test uses `page.route` to supply a response; it does **not** persist its column rename. The earlier assertion that this rename makes the suite order-dependent was unsupported.
- The prior claim that card edits preserve failed drafts was incorrect: editing closes immediately and reopening overwrites the draft. Finding 5 covers the actual behavior.
- Generic stale-closure speculation has been replaced with the independently reproduced request sequences in findings 3 and 4.
- Import-time configuration and currently unused future-facing timestamp fields do not, by themselves, warrant refactoring in this local MVP.

## Recommended remediation order

1. Restrict published network access and reject stale AI commands (findings 1-2).
2. Fix board-response reconciliation and preserve failed drafts (findings 3-6), with delayed-response and retry tests.
3. Tighten model-output validation and restore documented Unix usability (findings 7-8).
4. Verify and correct accessibility and error reporting (findings 9-11).
5. Rerun the complete Docker-backed Playwright suite and native lifecycle smoke checks once Docker is available. Passing unit tests alone should not close these findings.
