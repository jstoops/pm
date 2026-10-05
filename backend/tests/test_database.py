import sqlite3
from contextlib import closing
from pathlib import Path

import pytest

from app import database
from app.operations import CreateColumn, DeleteCard


def table_sql(connection: sqlite3.Connection, name: str) -> str:
    return connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()[0]


def test_initialization_is_idempotent(database_path: Path) -> None:
    database.initialize_database()

    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == len(database.MIGRATIONS)
        assert connection.execute("SELECT count(*) FROM users").fetchone()[0] == 1
        assert connection.execute("SELECT count(*) FROM boards").fetchone()[0] == 1


def test_single_board_database_upgrades_without_losing_data(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A database written by the original MVP (no user_version) keeps its board."""
    path = tmp_path / "legacy.db"
    monkeypatch.setattr(database, "DATABASE_PATH", path)
    with closing(sqlite3.connect(path)) as connection:
        connection.executescript(database.MIGRATIONS[0])
        connection.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (1, 'user', ?)",
            (database.password_hasher.hash("password"),),
        )
        connection.execute("INSERT INTO boards (id, user_id) VALUES (7, 1)")
        connection.execute(
            "INSERT INTO board_columns (id, board_id, title, position) VALUES (3, 7, 'Todo', 0)"
        )
        connection.execute(
            "INSERT INTO cards (column_id, title, details, position) VALUES (3, 'Kept', 'Old', 0)"
        )
        connection.commit()

    database.initialize_database()

    assert database.authenticate("user", "password") == 1
    boards = database.list_boards(1)
    assert boards == [
        {
            "id": "7",
            "name": "My board",
            "description": "",
            "cardCount": 1,
            "updatedAt": boards[0]["updatedAt"],
        }
    ]
    board = database.board_data(1, 7)
    assert [column["title"] for column in board["columns"]] == ["Todo"]
    assert [card["title"] for card in board["cards"].values()] == ["Kept"]
    # The rebuilt table allows many boards per user and cascades deletes.
    database.create_board(1, "Second")
    assert len(database.list_boards(1)) == 2
    with closing(sqlite3.connect(path)) as connection:
        assert "UNIQUE" not in table_sql(connection, "boards")
        assert "REFERENCES boards" in table_sql(connection, "board_columns")
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []


def test_deleting_a_board_cascades_to_columns_and_cards(database_path: Path) -> None:
    user_id = database.authenticate("user", "password")
    board_id = int(database.list_boards(user_id)[0]["id"])

    database.delete_board(user_id, board_id)

    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("SELECT count(*) FROM board_columns").fetchone()[0] == 0
        assert connection.execute("SELECT count(*) FROM cards").fetchone()[0] == 0
    with pytest.raises(database.BoardItemNotFoundError):
        database.board_data(user_id, board_id)


def test_failed_operation_batch_rolls_back_every_change() -> None:
    user_id = database.authenticate("user", "password")
    board = database.board_data(user_id, int(database.list_boards(user_id)[0]["id"]))
    operations = [
        CreateColumn(title="Added"),
        DeleteCard(cardId=999999),
    ]

    with pytest.raises(database.BoardItemNotFoundError):
        database.apply_operations(user_id, int(board["id"]), operations)

    assert database.board_data(user_id, int(board["id"])) == board
