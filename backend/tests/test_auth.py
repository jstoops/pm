import sqlite3
from contextlib import closing
from pathlib import Path

import httpx
import pytest
from conftest import first_board, login, new_client, register

from app import database

pytestmark = pytest.mark.anyio


def contains_password(value: object) -> bool:
    if isinstance(value, dict):
        return any(contains_password(item) for item in value.values())
    if isinstance(value, list):
        return any(contains_password(item) for item in value)
    return isinstance(value, str) and "password" in value.lower()


async def test_demo_user_signs_in_with_hashed_password(
    client: httpx.AsyncClient, database_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    assert (await client.get("/api/auth/session")).json() == {"authenticated": False}
    await login(client)
    session = (await client.get("/api/auth/session")).json()
    board = await first_board(client)

    assert session == {"authenticated": True, "username": "user"}
    assert board["name"] == "My first board"
    assert len(board["columns"]) == 5
    assert len(board["cards"]) == 8
    assert not contains_password(board)
    assert "password" not in caplog.text.lower()

    with closing(sqlite3.connect(database_path)) as connection:
        password_hash = connection.execute(
            "SELECT password_hash FROM users WHERE username = 'user'"
        ).fetchone()[0]
        user_insert = next(
            line for line in connection.iterdump() if line.startswith('INSERT INTO "users"')
        )
    assert password_hash.startswith("$argon2id$")
    assert database.password_hasher.verify(password_hash, "password")
    assert "'password'" not in user_insert


async def test_login_rejects_invalid_credentials(client: httpx.AsyncClient) -> None:
    wrong_password = await client.post(
        "/api/auth/login", json={"username": "user", "password": "incorrect"}
    )
    unknown_user = await client.post(
        "/api/auth/login", json={"username": "nobody", "password": "password"}
    )

    assert wrong_password.status_code == 401
    assert unknown_user.status_code == 401
    assert (await client.get("/api/auth/session")).json() == {"authenticated": False}


async def test_register_signs_in_with_a_seeded_first_board(client: httpx.AsyncClient) -> None:
    await register(client, "  Alice.Smith ")
    session = (await client.get("/api/auth/session")).json()
    board = await first_board(client)

    assert session == {"authenticated": True, "username": "alice.smith"}
    assert len(board["cards"]) == 8

    async with new_client() as other:
        await login(other, "ALICE.smith", "s3cret-pass")
        assert (await other.get("/api/auth/session")).json()["username"] == "alice.smith"


async def test_register_rejects_taken_and_invalid_usernames(client: httpx.AsyncClient) -> None:
    async def attempt(username: str, password: str = "long enough") -> int:
        response = await client.post(
            "/api/auth/register", json={"username": username, "password": password}
        )
        return response.status_code

    assert await attempt("USER") == 409
    assert await attempt("ab") == 422
    assert await attempt("has space") == 422
    assert await attempt("x" * 33) == 422
    assert await attempt("valid_name", "short") == 422
    assert (await client.get("/api/auth/session")).json() == {"authenticated": False}


async def test_account_reports_profile_and_board_count(client: httpx.AsyncClient) -> None:
    unauthenticated = await client.get("/api/account")
    await register(client, "bob")
    await client.post("/api/boards", json={"name": "Second"})
    account = (await client.get("/api/account")).json()

    assert unauthenticated.status_code == 401
    assert account["username"] == "bob"
    assert account["boardCount"] == 2
    assert account["createdAt"]


async def test_change_password_requires_current_password(client: httpx.AsyncClient) -> None:
    await register(client, "carol", "original-pass")
    rejected = await client.post(
        "/api/account/password",
        json={"current_password": "wrong-pass", "new_password": "updated-pass"},
    )
    too_short = await client.post(
        "/api/account/password",
        json={"current_password": "original-pass", "new_password": "short"},
    )
    changed = await client.post(
        "/api/account/password",
        json={"current_password": "original-pass", "new_password": "updated-pass"},
    )

    assert rejected.status_code == 403
    assert too_short.status_code == 422
    assert changed.status_code == 204
    async with new_client() as other:
        old = await other.post(
            "/api/auth/login", json={"username": "carol", "password": "original-pass"}
        )
        assert old.status_code == 401
        await login(other, "carol", "updated-pass")


async def test_delete_account_removes_boards_and_ends_every_session(
    client: httpx.AsyncClient, database_path: Path
) -> None:
    await register(client, "dave")
    async with new_client() as second_session:
        await login(second_session, "dave", "s3cret-pass")
        rejected = await client.post("/api/account/delete", json={"password": "wrong"})
        deleted = await client.post("/api/account/delete", json={"password": "s3cret-pass"})
        stale_session = await second_session.get("/api/boards")

    assert rejected.status_code == 403
    assert deleted.status_code == 204
    assert (await client.get("/api/auth/session")).json() == {"authenticated": False}
    assert stale_session.status_code == 401
    with closing(sqlite3.connect(database_path)) as connection:
        assert connection.execute("SELECT count(*) FROM boards").fetchone()[0] == 1
        assert connection.execute(
            "SELECT count(*) FROM users WHERE username = 'dave'"
        ).fetchone()[0] == 0


async def test_logout_ends_the_session(client: httpx.AsyncClient) -> None:
    await login(client)
    response = await client.post("/api/auth/logout")

    assert response.status_code == 204
    assert (await client.get("/api/boards")).status_code == 401
