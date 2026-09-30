import json
from pathlib import Path

import httpx
import pytest

from app import ai, database
from app.main import app


@pytest.fixture
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "project_management.db"
    monkeypatch.setattr(database, "DATABASE_PATH", path)
    return path


async def login(client: httpx.AsyncClient) -> None:
    response = await client.post(
        "/api/auth/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_chat_sends_board_question_and_bounded_history(
    database_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured_messages: list[dict[str, str]] = []

    def fake_openrouter(messages: list[dict[str, str]]) -> str:
        captured_messages.extend(messages)
        return json.dumps({"version": 1, "assistantText": "I can help.", "operations": []})

    monkeypatch.setattr(ai, "ask_openrouter", fake_openrouter)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        response = await client.post(
            "/api/chat",
            json={
                "message": "What should I work on?",
                "history": [{"role": "user", "content": "Earlier question"}],
            },
        )

    assert response.status_code == 200
    assert response.json() == {"assistantText": "I can help."}
    prompt = json.loads(captured_messages[1]["content"])
    assert prompt["question"] == "What should I work on?"
    assert prompt["history"] == [{"role": "user", "content": "Earlier question"}]
    assert len(prompt["board"]["columns"]) == 5


@pytest.mark.anyio
async def test_chat_persists_valid_multiple_operations(
    database_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        board = (await client.get("/api/board")).json()
        column_id = int(board["columns"][0]["id"])
        monkeypatch.setattr(
            ai,
            "ask_openrouter",
            lambda _messages: json.dumps(
                {
                    "version": 1,
                    "assistantText": "Updated the backlog.",
                    "operations": [
                        {"type": "rename_column", "columnId": column_id, "title": "Ideas"},
                        {
                            "type": "create_card",
                            "columnId": column_id,
                            "title": "AI task",
                            "details": "Created by the assistant.",
                        },
                    ],
                }
            ),
        )
        response = await client.post("/api/chat", json={"message": "Update the backlog"})

    assert response.status_code == 200
    updated_board = response.json()["board"]
    assert updated_board["columns"][0]["title"] == "Ideas"
    assert any(card["title"] == "AI task" for card in updated_board["cards"].values())


@pytest.mark.anyio
async def test_chat_rejects_malformed_or_invalid_changes_without_persistence(
    database_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await login(client)
        board = (await client.get("/api/board")).json()
        column_id = int(board["columns"][0]["id"])
        monkeypatch.setattr(ai, "ask_openrouter", lambda _messages: "not json")
        malformed = await client.post("/api/chat", json={"message": "Do something"})
        monkeypatch.setattr(
            ai,
            "ask_openrouter",
            lambda _messages: json.dumps(
                {
                    "version": 1,
                    "assistantText": "Changing cards.",
                    "operations": [
                        {"type": "rename_column", "columnId": column_id, "title": "Changed"},
                        {"type": "delete_card", "cardId": 999999},
                    ],
                }
            ),
        )
        invalid = await client.post("/api/chat", json={"message": "Do something"})
        persisted_board = (await client.get("/api/board")).json()

    assert malformed.status_code == 502
    assert invalid.status_code == 502
    assert persisted_board == board


@pytest.mark.anyio
async def test_chat_requires_authentication(database_path: Path) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/chat", json={"message": "Do something"})

    assert response.status_code == 401