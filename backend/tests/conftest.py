from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from app import database
from app.main import app


@pytest.fixture(autouse=True)
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "project_management.db"
    monkeypatch.setattr(database, "DATABASE_PATH", path)
    database.initialize_database()
    return path


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def new_client() -> httpx.AsyncClient:
    """A client with its own cookie jar, so each one is a separate browser session."""
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    async with new_client() as client:
        yield client


async def login(
    client: httpx.AsyncClient, username: str = "user", password: str = "password"
) -> None:
    response = await client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert response.status_code == 200


async def register(client: httpx.AsyncClient, username: str, password: str = "s3cret-pass") -> None:
    response = await client.post(
        "/api/auth/register", json={"username": username, "password": password}
    )
    assert response.status_code == 201


async def first_board(client: httpx.AsyncClient) -> dict:
    boards = (await client.get("/api/boards")).json()
    return (await client.get(f"/api/boards/{boards[0]['id']}")).json()
