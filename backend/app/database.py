import os
import sqlite3
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError


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


def connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with connect() as connection:
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
    initialize_database()
    with connect() as connection:
        user = connection.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None:
            if username != "user" or password != "password":
                return None
            cursor = connection.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hasher.hash(password)),
            )
            return cursor.lastrowid
        try:
            password_hasher.verify(user["password_hash"], password)
        except VerifyMismatchError:
            return None
        return user["id"]


def get_or_create_board(user_id: int) -> int:
    initialize_database()
    with connect() as connection:
        board = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?", (user_id,)
        ).fetchone()
        if board is not None:
            return board["id"]

        board_id = connection.execute(
            "INSERT INTO boards (user_id) VALUES (?)", (user_id,)
        ).lastrowid
        column_ids = []
        for position, title in enumerate(INITIAL_COLUMNS):
            column_ids.append(
                connection.execute(
                    "INSERT INTO board_columns (board_id, title, position) VALUES (?, ?, ?)",
                    (board_id, title, position),
                ).lastrowid
            )
        card_positions = [0] * len(INITIAL_COLUMNS)
        for column_position, title, details in INITIAL_CARDS:
            connection.execute(
                "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
                (
                    column_ids[column_position],
                    title,
                    details,
                    card_positions[column_position],
                ),
            )
            card_positions[column_position] += 1
        return board_id


def board_data(user_id: int) -> dict[str, object]:
    board_id = get_or_create_board(user_id)
    with connect() as connection:
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
        card_map[card_id] = {
            "id": card_id,
            "title": card["title"],
            "details": card["details"],
        }
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


def rename_column(user_id: int, column_id: int, title: str) -> bool:
    with connect() as connection:
        result = connection.execute(
            """
            UPDATE board_columns SET title = ?
            WHERE id = ? AND board_id = (SELECT id FROM boards WHERE user_id = ?)
            """,
            (title, column_id, user_id),
        )
        return result.rowcount == 1


def create_card(user_id: int, column_id: int, title: str, details: str) -> int | None:
    with connect() as connection:
        column = connection.execute(
            """
            SELECT board_columns.id FROM board_columns
            JOIN boards ON boards.id = board_columns.board_id
            WHERE board_columns.id = ? AND boards.user_id = ?
            """,
            (column_id, user_id),
        ).fetchone()
        if column is None:
            return None
        position = connection.execute(
            "SELECT count(*) FROM cards WHERE column_id = ?", (column_id,)
        ).fetchone()[0]
        return connection.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
            (column_id, title, details, position),
        ).lastrowid


def update_card(
    user_id: int, card_id: int, title: str | None, details: str | None
) -> bool:
    fields = []
    values: list[str] = []
    if title is not None:
        fields.append("title = ?")
        values.append(title)
    if details is not None:
        fields.append("details = ?")
        values.append(details)
    if not fields:
        return False
    fields.append("updated_at = CURRENT_TIMESTAMP")
    values.extend([str(card_id), str(user_id)])
    with connect() as connection:
        result = connection.execute(
            f"""
            UPDATE cards SET {", ".join(fields)}
            WHERE id = ? AND column_id IN (
                SELECT board_columns.id FROM board_columns
                JOIN boards ON boards.id = board_columns.board_id
                WHERE boards.user_id = ?
            )
            """,
            values,
        )
        return result.rowcount == 1


def delete_card(user_id: int, card_id: int) -> bool:
    with connect() as connection:
        card = connection.execute(
            """
            SELECT cards.column_id FROM cards
            JOIN board_columns ON board_columns.id = cards.column_id
            JOIN boards ON boards.id = board_columns.board_id
            WHERE cards.id = ? AND boards.user_id = ?
            """,
            (card_id, user_id),
        ).fetchone()
        if card is None:
            return False
        connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        _write_column_order(connection, card["column_id"], _card_ids(connection, card["column_id"]))
        return True


def move_card(user_id: int, card_id: int, column_id: int, position: int) -> bool:
    with connect() as connection:
        card = connection.execute(
            """
            SELECT cards.column_id FROM cards
            JOIN board_columns ON board_columns.id = cards.column_id
            JOIN boards ON boards.id = board_columns.board_id
            WHERE cards.id = ? AND boards.user_id = ?
            """,
            (card_id, user_id),
        ).fetchone()
        target = connection.execute(
            """
            SELECT board_columns.id FROM board_columns
            JOIN boards ON boards.id = board_columns.board_id
            WHERE board_columns.id = ? AND boards.user_id = ?
            """,
            (column_id, user_id),
        ).fetchone()
        if card is None or target is None:
            return False

        source_id = card["column_id"]
        source_cards = _card_ids(connection, source_id)
        source_cards.remove(card_id)
        target_cards = source_cards if source_id == column_id else _card_ids(connection, column_id)
        target_cards.insert(min(position, len(target_cards)), card_id)
        _write_column_order(connection, source_id, source_cards)
        if source_id != column_id:
            _write_column_order(connection, column_id, target_cards)
        return True


class AICommandError(ValueError):
    pass


def apply_ai_operations(user_id: int, operations: list[dict[str, object]]) -> None:
    board_id = get_or_create_board(user_id)
    with connect() as connection:
        for operation in operations:
            command_type = operation["type"]
            if command_type == "rename_column":
                _rename_column_in_connection(
                    connection, board_id, int(operation["columnId"]), str(operation["title"])
                )
            elif command_type == "create_card":
                _create_card_in_connection(
                    connection,
                    board_id,
                    int(operation["columnId"]),
                    str(operation["title"]),
                    str(operation.get("details", "")),
                )
            elif command_type == "update_card":
                _update_card_in_connection(
                    connection,
                    board_id,
                    int(operation["cardId"]),
                    operation.get("title"),
                    operation.get("details"),
                )
            elif command_type == "move_card":
                _move_card_in_connection(
                    connection,
                    board_id,
                    int(operation["cardId"]),
                    int(operation["columnId"]),
                    int(operation["position"]),
                )
            elif command_type == "delete_card":
                _delete_card_in_connection(connection, board_id, int(operation["cardId"]))
            else:
                raise AICommandError("AI response contains an unsupported operation.")


def _column_belongs_to_board(
    connection: sqlite3.Connection, board_id: int, column_id: int
) -> bool:
    return connection.execute(
        "SELECT 1 FROM board_columns WHERE id = ? AND board_id = ?", (column_id, board_id)
    ).fetchone() is not None


def _card_column_for_board(
    connection: sqlite3.Connection, board_id: int, card_id: int
) -> int | None:
    row = connection.execute(
        """
        SELECT cards.column_id FROM cards
        JOIN board_columns ON board_columns.id = cards.column_id
        WHERE cards.id = ? AND board_columns.board_id = ?
        """,
        (card_id, board_id),
    ).fetchone()
    return row["column_id"] if row is not None else None


def _rename_column_in_connection(
    connection: sqlite3.Connection, board_id: int, column_id: int, title: str
) -> None:
    if not _column_belongs_to_board(connection, board_id, column_id):
        raise AICommandError("AI response references a column outside this board.")
    connection.execute("UPDATE board_columns SET title = ? WHERE id = ?", (title, column_id))


def _create_card_in_connection(
    connection: sqlite3.Connection,
    board_id: int,
    column_id: int,
    title: str,
    details: str,
) -> None:
    if not _column_belongs_to_board(connection, board_id, column_id):
        raise AICommandError("AI response references a column outside this board.")
    position = connection.execute(
        "SELECT count(*) FROM cards WHERE column_id = ?", (column_id,)
    ).fetchone()[0]
    connection.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (column_id, title, details, position),
    )


def _update_card_in_connection(
    connection: sqlite3.Connection,
    board_id: int,
    card_id: int,
    title: object | None,
    details: object | None,
) -> None:
    if _card_column_for_board(connection, board_id, card_id) is None:
        raise AICommandError("AI response references a card outside this board.")
    fields = []
    values: list[object] = []
    if title is not None:
        fields.append("title = ?")
        values.append(title)
    if details is not None:
        fields.append("details = ?")
        values.append(details)
    fields.append("updated_at = CURRENT_TIMESTAMP")
    values.append(card_id)
    connection.execute(f"UPDATE cards SET {', '.join(fields)} WHERE id = ?", values)


def _delete_card_in_connection(
    connection: sqlite3.Connection, board_id: int, card_id: int
) -> None:
    column_id = _card_column_for_board(connection, board_id, card_id)
    if column_id is None:
        raise AICommandError("AI response references a card outside this board.")
    connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _write_column_order(connection, column_id, _card_ids(connection, column_id))


def _move_card_in_connection(
    connection: sqlite3.Connection,
    board_id: int,
    card_id: int,
    column_id: int,
    position: int,
) -> None:
    source_id = _card_column_for_board(connection, board_id, card_id)
    if source_id is None or not _column_belongs_to_board(connection, board_id, column_id):
        raise AICommandError("AI response references a card or column outside this board.")
    source_cards = _card_ids(connection, source_id)
    source_cards.remove(card_id)
    target_cards = source_cards if source_id == column_id else _card_ids(connection, column_id)
    target_cards.insert(min(position, len(target_cards)), card_id)
    _write_column_order(connection, source_id, source_cards)
    if source_id != column_id:
        _write_column_order(connection, column_id, target_cards)


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