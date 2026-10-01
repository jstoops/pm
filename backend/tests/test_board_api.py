import sqlite3
from pathlib import Path

import httpx
import pytest

from app import database
from app.main import app


async def login(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200


def contains_password(value: object) -> bool:
    if isinstance(value, dict):
        return any(contains_password(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_password(item) for item in value)
    return isinstance(value, str) and "password" in value.lower()


@pytest.mark.anyio
async def test_first_board_is_seeded_and_password_is_hashed(
    database_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        unauthenticated = await client.get("/api/board")
        await login(client)
        board_response = await client.get("/api/board")
        session_response = await client.get("/api/auth/session")

    assert unauthenticated.status_code == 401
    board = board_response.json()
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8
    assert session_response.json() == {"authenticated": True}
    assert not contains_password(board)
    assert "password" not in caplog.text.lower()

    with sqlite3.connect(database_path) as connection:
        password_hash = connection.execute(
            "SELECT password_hash FROM users WHERE username = 'user'"
        ).fetchone()[0]
        user_insert = next(
            line
            for line in connection.iterdump()
            if line.startswith('INSERT INTO "users"')
        )
    assert password_hash != "password"
    assert database.password_hasher.verify(password_hash, "password")
    assert "'password'" not in user_insert


@pytest.mark.anyio
async def test_board_mutations_persist_for_a_new_client() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        board = (await client.get("/api/board")).json()
        first_column, second_column = board["columns"][:2]

        renamed = await client.patch(
            f"/api/board/columns/{first_column['id']}", json={"title": "Ideas"}
        )
        created = await client.post(
            "/api/board/cards",
            json={
                "column_id": int(first_column["id"]),
                "title": "Persisted card",
                "details": "Created through the API.",
            },
        )
        card_id = next(
            card_id
            for card_id, card in created.json()["cards"].items()
            if card["title"] == "Persisted card"
        )
        updated = await client.patch(
            f"/api/board/cards/{card_id}",
            json={"title": "Updated card", "details": "Edited details."},
        )
        moved = await client.post(
            f"/api/board/cards/{card_id}/move",
            json={"column_id": int(second_column["id"]), "position": 0},
        )
        deleted = await client.delete(f"/api/board/cards/{card_id}")

    assert renamed.json()["columns"][0]["title"] == "Ideas"
    assert updated.json()["cards"][card_id] == {
        "id": card_id,
        "title": "Updated card",
        "details": "Edited details.",
    }
    assert moved.json()["columns"][1]["cardIds"][0] == card_id
    assert card_id not in deleted.json()["cards"]

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        persisted_board = (await client.get("/api/board")).json()

    assert persisted_board["columns"][0]["title"] == "Ideas"
    assert card_id not in persisted_board["cards"]


@pytest.mark.anyio
async def test_board_rejects_invalid_or_foreign_resources(database_path: Path) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        board = (await client.get("/api/board")).json()
        invalid_update = await client.patch("/api/board/cards/999999", json={"title": "Nope"})
        empty_update = await client.patch(
            f"/api/board/cards/{board['columns'][0]['cardIds'][0]}", json={}
        )

    with sqlite3.connect(database_path) as connection:
        other_user_id = connection.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("other", database.password_hasher.hash("another password")),
        ).lastrowid
        other_board_id = connection.execute(
            "INSERT INTO boards (user_id) VALUES (?)", (other_user_id,)
        ).lastrowid
        other_column_id = connection.execute(
            "INSERT INTO board_columns (board_id, title, position) VALUES (?, ?, ?)",
            (other_board_id, "Private", 0),
        ).lastrowid
        other_card_id = connection.execute(
            "INSERT INTO cards (column_id, title, position) VALUES (?, ?, ?)",
            (other_column_id, "Private card", 0),
        ).lastrowid

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        foreign_update = await client.patch(
            f"/api/board/cards/{other_card_id}", json={"title": "Stolen"}
        )

    assert invalid_update.status_code == 404
    assert empty_update.status_code == 422
    assert foreign_update.status_code == 404


@pytest.mark.anyio
async def test_board_rejects_blank_titles_without_changes() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        board = (await client.get("/api/board")).json()
        column_id = board["columns"][0]["id"]
        card_id = board["columns"][0]["cardIds"][0]
        responses = [
            await client.patch(f"/api/board/columns/{column_id}", json={"title": "   "}),
            await client.post(
                "/api/board/cards", json={"column_id": int(column_id), "title": "  "}
            ),
            await client.patch(f"/api/board/cards/{card_id}", json={"title": " "}),
        ]
        persisted_board = (await client.get("/api/board")).json()

    assert [response.status_code for response in responses] == [422, 422, 422]
    assert persisted_board == board
