import os
import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.operations import (
    BoardOperation,
    CreateCard,
    CreateColumn,
    DeleteCard,
    DeleteColumn,
    MoveCard,
    MoveColumn,
    RenameColumn,
    UpdateBoard,
    UpdateCard,
)

DATABASE_PATH = Path(
    os.environ.get("DATABASE_PATH", "/app/data/project_management.db")
)
password_hasher = PasswordHasher()

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
FIRST_BOARD_NAME = "My first board"
INITIAL_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
INITIAL_CARDS = [
    (0, "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
    (0, "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    (1, "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    (2, "Refine status language", "Standardize column labels and tone across the board."),
    (2, "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    (3, "QA micro-interactions", "Verify hover, focus, and loading states."),
    (4, "Ship marketing page", "Final copy approved and asset pack delivered."),
    (4, "Close onboarding sprint", "Document release notes and share internally."),
]

# Each entry upgrades the schema by one version; PRAGMA user_version records how
# many have run. Version 1 is the original single-board MVP schema, written with
# IF NOT EXISTS so databases created before versioning upgrade cleanly.
MIGRATIONS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS board_columns (
        id INTEGER PRIMARY KEY,
        board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        position INTEGER NOT NULL CHECK (position >= 0),
        UNIQUE(board_id, position)
    );
    CREATE INDEX IF NOT EXISTS board_columns_board_position
        ON board_columns(board_id, position);
    CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY,
        column_id INTEGER NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        details TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL CHECK (position >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(column_id, position)
    );
    CREATE INDEX IF NOT EXISTS cards_column_position ON cards(column_id, position);
    """,
    # Version 2: many named boards per user. SQLite cannot drop the UNIQUE
    # constraint in place, so the table is rebuilt (foreign keys are off here).
    """
    CREATE TABLE boards_v2 (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO boards_v2 (id, user_id, name, created_at, updated_at)
        SELECT id, user_id, 'My board', created_at, updated_at FROM boards;
    DROP TABLE boards;
    ALTER TABLE boards_v2 RENAME TO boards;
    CREATE INDEX boards_user ON boards(user_id);
    """,
]


class BoardItemNotFoundError(LookupError):
    pass


class UsernameTakenError(ValueError):
    pass


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Yields a connection inside a write-locked transaction that commits on success."""
    connection = sqlite3.connect(DATABASE_PATH, autocommit=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        connection.execute("BEGIN IMMEDIATE")
        yield connection
        connection.execute("COMMIT")
    finally:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        connection.close()


def initialize_database() -> None:
    """Runs pending migrations, then creates the demo account if it is missing."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DATABASE_PATH, autocommit=True)) as connection:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        for number, script in enumerate(MIGRATIONS[version:], start=version + 1):
            connection.executescript(f"BEGIN; {script}; PRAGMA user_version = {number}; COMMIT;")

    with transaction() as connection:
        if connection.execute(
            "SELECT 1 FROM users WHERE username = ?", (DEMO_USERNAME,)
        ).fetchone() is None:
            _create_user(connection, DEMO_USERNAME, DEMO_PASSWORD)


def create_user(username: str, password: str) -> int:
    """Creates the account and its seeded first board. Raises UsernameTakenError."""
    with transaction() as connection:
        try:
            return _create_user(connection, username, password)
        except sqlite3.IntegrityError as error:
            raise UsernameTakenError("That username is taken.") from error


def authenticate(username: str, password: str) -> int | None:
    with transaction() as connection:
        user = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    if user is None or not _password_matches(user["password_hash"], password):
        return None
    return user["id"]


def account(user_id: int) -> dict[str, object] | None:
    with transaction() as connection:
        user = connection.execute(
            "SELECT username, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if user is None:
            return None
        board_count = connection.execute(
            "SELECT count(*) FROM boards WHERE user_id = ?", (user_id,)
        ).fetchone()[0]
    return {"username": user["username"], "createdAt": user["created_at"], "boardCount": board_count}


def change_password(user_id: int, current_password: str, new_password: str) -> bool:
    with transaction() as connection:
        if not _password_matches(_password_hash(connection, user_id), current_password):
            return False
        connection.execute(
            "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (password_hasher.hash(new_password), user_id),
        )
        return True


def delete_user(user_id: int, password: str) -> bool:
    """Deletes the account and, by cascade, all of its boards."""
    with transaction() as connection:
        if not _password_matches(_password_hash(connection, user_id), password):
            return False
        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return True


def list_boards(user_id: int) -> list[dict[str, object]]:
    with transaction() as connection:
        rows = connection.execute(
            """
            SELECT boards.id, boards.name, boards.description, boards.updated_at,
                (SELECT count(*) FROM cards JOIN board_columns
                    ON board_columns.id = cards.column_id
                    WHERE board_columns.board_id = boards.id) AS card_count
            FROM boards WHERE user_id = ? ORDER BY boards.id
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "description": row["description"],
            "cardCount": row["card_count"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def create_board(user_id: int, name: str, description: str = "") -> dict[str, object]:
    """Creates a board with the default columns and no cards, returning its data."""
    with transaction() as connection:
        board_id = _create_board(connection, user_id, name, description)
        return _board_data(connection, board_id)


def delete_board(user_id: int, board_id: int) -> None:
    with transaction() as connection:
        _require_board(connection, user_id, board_id)
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def board_data(user_id: int, board_id: int) -> dict[str, object]:
    with transaction() as connection:
        _require_board(connection, user_id, board_id)
        return _board_data(connection, board_id)


def apply_operations(
    user_id: int, board_id: int, operations: list[BoardOperation]
) -> dict[str, object]:
    """Applies every operation in one transaction and returns the resulting board.

    Raises BoardItemNotFoundError, leaving the board unchanged, if the board is
    not the user's or any operation references a card or column outside it.
    """
    with transaction() as connection:
        _require_board(connection, user_id, board_id)
        for operation in operations:
            match operation:
                case UpdateBoard():
                    connection.execute(
                        "UPDATE boards SET name = coalesce(?, name), "
                        "description = coalesce(?, description) WHERE id = ?",
                        (operation.name, operation.description, board_id),
                    )
                case CreateColumn():
                    connection.execute(
                        "INSERT INTO board_columns (board_id, title, position) VALUES (?, ?, ?)",
                        (board_id, operation.title, len(_column_ids(connection, board_id))),
                    )
                case RenameColumn():
                    _require_column(connection, board_id, operation.column_id)
                    connection.execute(
                        "UPDATE board_columns SET title = ? WHERE id = ?",
                        (operation.title, operation.column_id),
                    )
                case MoveColumn():
                    _require_column(connection, board_id, operation.column_id)
                    column_ids = _column_ids(connection, board_id)
                    column_ids.remove(operation.column_id)
                    column_ids.insert(min(operation.position, len(column_ids)), operation.column_id)
                    _write_board_order(connection, board_id, column_ids)
                case DeleteColumn():
                    _require_column(connection, board_id, operation.column_id)
                    connection.execute(
                        "DELETE FROM board_columns WHERE id = ?", (operation.column_id,)
                    )
                    _write_board_order(connection, board_id, _column_ids(connection, board_id))
                case CreateCard():
                    _require_column(connection, board_id, operation.column_id)
                    connection.execute(
                        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
                        (
                            operation.column_id,
                            operation.title,
                            operation.details,
                            len(_card_ids(connection, operation.column_id)),
                        ),
                    )
                case UpdateCard():
                    _require_card_column(connection, board_id, operation.card_id)
                    connection.execute(
                        """
                        UPDATE cards SET title = coalesce(?, title), details = coalesce(?, details),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (operation.title, operation.details, operation.card_id),
                    )
                case MoveCard():
                    source_id = _require_card_column(connection, board_id, operation.card_id)
                    _require_column(connection, board_id, operation.column_id)
                    source_cards = _card_ids(connection, source_id)
                    source_cards.remove(operation.card_id)
                    if source_id == operation.column_id:
                        target_cards = source_cards
                    else:
                        _write_column_order(connection, source_id, source_cards)
                        target_cards = _card_ids(connection, operation.column_id)
                    target_cards.insert(min(operation.position, len(target_cards)), operation.card_id)
                    _write_column_order(connection, operation.column_id, target_cards)
                case DeleteCard():
                    column_id = _require_card_column(connection, board_id, operation.card_id)
                    connection.execute("DELETE FROM cards WHERE id = ?", (operation.card_id,))
                    _write_column_order(connection, column_id, _card_ids(connection, column_id))
        connection.execute(
            "UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (board_id,)
        )
        return _board_data(connection, board_id)


def _create_user(connection: sqlite3.Connection, username: str, password: str) -> int:
    user_id = connection.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, password_hasher.hash(password)),
    ).lastrowid
    board_id = _create_board(connection, user_id, FIRST_BOARD_NAME)
    column_ids = _column_ids(connection, board_id)
    card_positions = [0] * len(column_ids)
    for column_position, title, details in INITIAL_CARDS:
        connection.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (column_ids[column_position], title, details, card_positions[column_position]),
        )
        card_positions[column_position] += 1
    return user_id


def _create_board(
    connection: sqlite3.Connection, user_id: int, name: str, description: str = ""
) -> int:
    board_id = connection.execute(
        "INSERT INTO boards (user_id, name, description) VALUES (?, ?, ?)",
        (user_id, name, description),
    ).lastrowid
    connection.executemany(
        "INSERT INTO board_columns (board_id, title, position) VALUES (?, ?, ?)",
        [(board_id, title, position) for position, title in enumerate(INITIAL_COLUMNS)],
    )
    return board_id


def _password_hash(connection: sqlite3.Connection, user_id: int) -> str:
    return connection.execute(
        "SELECT password_hash FROM users WHERE id = ?", (user_id,)
    ).fetchone()["password_hash"]


def _password_matches(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def _board_data(connection: sqlite3.Connection, board_id: int) -> dict[str, object]:
    board = connection.execute(
        "SELECT id, name, description FROM boards WHERE id = ?", (board_id,)
    ).fetchone()
    columns = connection.execute(
        "SELECT id, title FROM board_columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()
    cards = connection.execute(
        """
        SELECT cards.id, cards.column_id, cards.title, cards.details
        FROM cards JOIN board_columns ON board_columns.id = cards.column_id
        WHERE board_columns.board_id = ? ORDER BY cards.position
        """,
        (board_id,),
    ).fetchall()

    cards_by_column: dict[int, list[str]] = {column["id"]: [] for column in columns}
    card_map: dict[str, dict[str, str]] = {}
    for card in cards:
        card_id = str(card["id"])
        cards_by_column[card["column_id"]].append(card_id)
        card_map[card_id] = {"id": card_id, "title": card["title"], "details": card["details"]}
    return {
        "id": str(board["id"]),
        "name": board["name"],
        "description": board["description"],
        "columns": [
            {
                "id": str(column["id"]),
                "title": column["title"],
                "cardIds": cards_by_column[column["id"]],
            }
            for column in columns
        ],
        "cards": card_map,
    }


def _require_board(connection: sqlite3.Connection, user_id: int, board_id: int) -> None:
    if connection.execute(
        "SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
    ).fetchone() is None:
        raise BoardItemNotFoundError("Board not found.")


def _require_column(connection: sqlite3.Connection, board_id: int, column_id: int) -> None:
    if connection.execute(
        "SELECT 1 FROM board_columns WHERE id = ? AND board_id = ?", (column_id, board_id)
    ).fetchone() is None:
        raise BoardItemNotFoundError("Column not found.")


def _require_card_column(connection: sqlite3.Connection, board_id: int, card_id: int) -> int:
    """Returns the id of the column holding the card."""
    row = connection.execute(
        """
        SELECT cards.column_id FROM cards
        JOIN board_columns ON board_columns.id = cards.column_id
        WHERE cards.id = ? AND board_columns.board_id = ?
        """,
        (card_id, board_id),
    ).fetchone()
    if row is None:
        raise BoardItemNotFoundError("Card not found.")
    return row["column_id"]


def _column_ids(connection: sqlite3.Connection, board_id: int) -> list[int]:
    return [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM board_columns WHERE board_id = ? ORDER BY position", (board_id,)
        )
    ]


def _card_ids(connection: sqlite3.Connection, column_id: int) -> list[int]:
    return [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
        )
    ]


# Both writers first shift every position out of the way so rewriting the order
# never collides with the UNIQUE(parent, position) constraints.


def _write_board_order(
    connection: sqlite3.Connection, board_id: int, column_ids: list[int]
) -> None:
    connection.execute(
        "UPDATE board_columns SET position = position + 1000000 WHERE board_id = ?", (board_id,)
    )
    connection.executemany(
        "UPDATE board_columns SET position = ? WHERE id = ?",
        [(position, column_id) for position, column_id in enumerate(column_ids)],
    )


def _write_column_order(
    connection: sqlite3.Connection, column_id: int, card_ids: list[int]
) -> None:
    connection.execute(
        "UPDATE cards SET position = position + 1000000 WHERE column_id = ?", (column_id,)
    )
    connection.executemany(
        "UPDATE cards SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [(column_id, position, card_id) for position, card_id in enumerate(card_ids)],
    )
