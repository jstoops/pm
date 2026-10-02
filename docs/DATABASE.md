# Database Design

## Decision

Use SQLite at `/app/data/project_management.db`. A named Docker volume is mounted at `/app/data`; the backend creates the database when absent and enables foreign-key enforcement for every connection.

The schema is defined in [DATABASE_SCHEMA.json](DATABASE_SCHEMA.json). Every table uses SQLite's `INTEGER PRIMARY KEY`, providing independent, generated integer identifiers for users, boards, columns, and cards.

## Data Model

- `users` holds each account: a unique, lowercase `username`, an Argon2id `password_hash`, and creation/update timestamps.
- `boards` belongs to a user (any number per user) and has a non-blank `name` and a `description`.
- `board_columns` stores each board's columns, their names, and order. Columns can be added, renamed, reordered, and deleted.
- `cards` belongs to a column and stores its order within that column.
- Foreign keys cascade from user to board to column to card, so deleting an account or board removes everything under it.

The service layer keeps each `position` sequence contiguous and performs each change in one SQLite transaction that takes the write lock up front (`BEGIN IMMEDIATE`), so concurrent requests cannot compute the same position. Unique ordering constraints prevent duplicate positions.

## Password Security

The backend hashes every password with Argon2id before inserting it into SQLite and verifies login attempts server-side. Plaintext passwords are never stored in the database, returned in API responses, or written to logs. `users.updated_at` changes when the password changes. Changing the password or deleting the account requires the current password.

A password must be transiently submitted to the authentication server for verification. Sending a client-side password hash instead is not secure: that hash becomes a replayable password equivalent and does not replace server-side salting. Local use is over localhost HTTP. Non-local deployments must terminate TLS 1.2 or newer, prefer TLS 1.3 where supported, and set `SESSION_HTTPS_ONLY=true` so session cookies carry the `Secure` attribute.

## Initialization and Migrations

`initialize_database()` runs at startup. `PRAGMA user_version` records how many entries of `MIGRATIONS` in `backend/app/database.py` have been applied; each pending one runs in its own transaction and bumps the version.

1. The original single-board schema, written with `IF NOT EXISTS` so databases created before versioning (version 0 with tables present) upgrade cleanly.
2. Rebuilds `boards` without the one-board-per-user `UNIQUE` constraint and adds `name` (existing boards become "My board") and `description`.

To change the schema, append a migration; never edit one that has shipped. After migrating, startup creates the demo account `user` / `password` if it is missing.

Registering an account creates it with a seeded first board ("My first board": five columns and sample cards). Boards created later get the five default columns and no cards.

## API Representation

The API returns the frontend `BoardData` shape: the board's `id`, `name` and `description`, ordered `columns`, each with `cardIds`, plus a `cards` object keyed by card ID. `GET /api/boards` returns summaries (`id`, `name`, `description`, `cardCount`, `updatedAt`). Database integer IDs are serialized as decimal strings at this boundary because JSON object keys and the frontend record types are strings; the SQLite schema itself contains no text primary or foreign keys.

## Security Tests

- Create a user and assert the stored `password_hash` is Argon2id and verifies the password while differing from the plaintext value.
- Query the database and assert the plaintext password is absent from all persisted user data.
- Assert login, session, board, and error responses never include a password or password hash.
- Capture application logs during login and assert they do not contain the plaintext password.
- Assert one user cannot read or change another user's boards, columns, or cards, through any route or the AI.
- Assert a deleted account's other sessions are rejected.
- Assert the frontend does not retain the password in `localStorage` or `sessionStorage`; browser/API tests may submit it only to the same-origin auth endpoints. HTTPS is the required production transport control.
