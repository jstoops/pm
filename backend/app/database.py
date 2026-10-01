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
    DeleteCard,
    MoveCard,
    RenameColumn,
    UpdateCard,
)

DATABASE_PATH = Path(
    os.environ.get("DATABASE_PATH", "/app/data/project_management.db")
)
password_hasher = PasswordHasher()

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


class BoardItemNotFoundError(LookupError):
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
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DATABASE_PATH, autocommit=True)) as connection:
        connection.executescript(
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
            """
        )


def authenticate_mvp_user(username: str, password: str) -> int | None:
    with transaction() as connection:
        user = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None:
            if username != "user" or password != "password":
                return None
            return connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hasher.hash(password)),
            ).lastrowid
        try:
            password_hasher.verify(user["password_hash"], password)
        except VerifyMismatchError:
            return None
        return user["id"]


def board_data(user_id: int) -> dict[str, object]:
    with transaction() as connection:
        return _board_data(connection, _board_id(connection, user_id))


def apply_operations(user_id: int, operations: list[BoardOperation]) -> dict[str, object]:
    """Applies every operation in one transaction and returns the resulting board.

    Raises BoardItemNotFoundError, leaving the board unchanged, if any operation
    references a card or column outside the user's board.
    """
    with transaction() as connection:
        board_id = _board_id(connection, user_id)
        for operation in operations:
            match operation:
                case RenameColumn():
                    _require_column(connection, board_id, operation.column_id)
                    connection.execute(
                        "UPDATE board_columns SET title = ? WHERE id = ?",
                        (operation.title, operation.column_id),
                    )
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
                    target_cards = (
                        source_cards
                        if source_id == operation.column_id
                        else _card_ids(connection, operation.column_id)
                    )
                    target_cards.insert(min(operation.position, len(target_cards)), operation.card_id)
                    _write_column_order(connection, source_id, source_cards)
                    if source_id != operation.column_id:
                        _write_column_order(connection, operation.column_id, target_cards)
                case DeleteCard():
                    column_id = _require_card_column(connection, board_id, operation.card_id)
                    connection.execute("DELETE FROM cards WHERE id = ?", (operation.card_id,))
                    _write_column_order(connection, column_id, _card_ids(connection, column_id))
        return _board_data(connection, board_id)


def _board_id(connection: sqlite3.Connection, user_id: int) -> int:
    """Returns the user's board id, creating and seeding the board on first access."""
    board = connection.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()
    if board is not None:
        return board["id"]

    board_id = connection.execute("INSERT INTO boards (user_id) VALUES (?)", (user_id,)).lastrowid
    column_ids = [
        connection.execute(
            "INSERT INTO board_columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, title, position),
        ).lastrowid
        for position, title in enumerate(INITIAL_COLUMNS)
    ]
    card_positions = [0] * len(INITIAL_COLUMNS)
    for column_position, title, details in INITIAL_CARDS:
        connection.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (column_ids[column_position], title, details, card_positions[column_position]),
        )
        card_positions[column_position] += 1
    return board_id


def _board_data(connection: sqlite3.Connection, board_id: int) -> dict[str, object]:
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


def _card_ids(connection: sqlite3.Connection, column_id: int) -> list[int]:
    return [
        row["id"]
        for row in connection.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
        )
    ]


def _write_column_order(
    connection: sqlite3.Connection, column_id: int, card_ids: list[int]
) -> None:
    connection.execute(
        "UPDATE cards SET position = position + 1000000 WHERE column_id = ?", (column_id,)
    )
    for position, card_id in enumerate(card_ids):
        connection.execute(
            "UPDATE cards SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (column_id, position, card_id),
        )
