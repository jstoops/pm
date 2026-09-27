# Database Design

## Decision

Use SQLite at `/app/data/project_management.db`. Part 6 will add a named Docker volume mounted at `/app/data`, create the database when absent, and enable foreign-key enforcement for every connection.

The schema is defined in [DATABASE_SCHEMA.json](DATABASE_SCHEMA.json). Every table uses SQLite's `INTEGER PRIMARY KEY`, providing independent, generated integer identifiers for users, boards, columns, and cards.

## Data Model

- `users` supports future multiple users through a unique `username`, an Argon2id `password_hash`, and creation/update timestamps.
- `boards` has a unique `user_id`, enforcing the MVP rule of one board per user.
- `board_columns` stores the fixed five workflow columns, their names, and order.
- `cards` belongs to a column and stores its order within that column.
- Foreign keys cascade from user to board to column to card.

The service layer will keep each `position` sequence contiguous and perform a move or reorder in one SQLite transaction. Unique ordering constraints prevent duplicate positions.

## Password Security

Part 6 will hash the hardcoded user's password with Argon2id before inserting it into SQLite and will verify login attempts server-side. Plaintext passwords will never be stored in the database, returned in API responses, or written to logs. `users.updated_at` changes when a password or future contact information changes.

A password must be transiently submitted to the authentication server for verification. Sending a client-side password hash instead is not secure: that hash becomes a replayable password equivalent and does not replace server-side salting. The local MVP uses localhost HTTP; any non-local deployment must use HTTPS and set the session cookie's `Secure` attribute.

## Initialization

On first board access in Part 6, the backend will atomically create the hardcoded user's row, board, and five seed columns if they do not already exist. The current demo cards may be used as initial seed data once; later reads and writes will use SQLite.

## API Representation

The API returns the existing frontend `BoardData` shape: ordered `columns`, each with `cardIds`, plus a `cards` object keyed by card ID. Database integer IDs are serialized as decimal strings at this boundary because JSON object keys and the current frontend record type are strings; the SQLite schema itself contains no text primary or foreign keys.

## Required Part 6 Security Tests

- Create a user and assert the stored `password_hash` verifies the password while differing from the plaintext value.
- Query the database and assert the plaintext password is absent from all persisted user data.
- Assert login, session, board, and error responses never include a password or password hash.
- Capture application logs during login and assert they do not contain the plaintext password.
- Assert the frontend does not retain the password in `localStorage` or `sessionStorage`; browser/API tests may submit it only to the same-origin login endpoint. HTTPS is the required production transport control.

## Out of Scope

This phase only approves the design. It does not add database dependencies, migrations, a Docker volume, or persistence code; those changes begin in Part 6 after approval.