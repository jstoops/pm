import json
from collections.abc import Callable

import httpx
import pytest
from conftest import first_board, login, new_client, register

from app import ai

pytestmark = pytest.mark.anyio


def reply(
    monkeypatch: pytest.MonkeyPatch, assistant_text: str, operations: list[dict]
) -> None:
    monkeypatch.setattr(
        ai,
        "ask_openrouter",
        lambda _messages, _format: json.dumps(
            {"version": 1, "assistantText": assistant_text, "operations": operations}
        ),
    )


async def chat(client: httpx.AsyncClient, board_id: str, message: str = "Do something"):
    return await client.post(f"/api/boards/{board_id}/chat", json={"message": message})


async def test_chat_sends_board_question_and_bounded_history(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured_messages: list[dict[str, str]] = []

    def fake_openrouter(messages: list[dict[str, str]], response_format: object) -> str:
        assert response_format == ai.RESPONSE_FORMAT
        captured_messages.extend(messages)
        return json.dumps({"version": 1, "assistantText": "I can help.", "operations": []})

    monkeypatch.setattr(ai, "ask_openrouter", fake_openrouter)
    await login(client)
    board = await first_board(client)
    response = await client.post(
        f"/api/boards/{board['id']}/chat",
        json={
            "message": "What should I work on?",
            "history": [{"role": "user", "content": "Earlier question"}],
        },
    )
    too_much_history = await client.post(
        f"/api/boards/{board['id']}/chat",
        json={"message": "Hi", "history": [{"role": "user", "content": "x"}] * 13},
    )

    assert response.status_code == 200
    assert response.json() == {"assistantText": "I can help."}
    prompt = json.loads(captured_messages[1]["content"])
    assert prompt["question"] == "What should I work on?"
    assert prompt["history"] == [{"role": "user", "content": "Earlier question"}]
    assert prompt["board"] == board
    assert too_much_history.status_code == 422


async def test_chat_persists_valid_multiple_operations(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await login(client)
    board = await first_board(client)
    column_id = int(board["columns"][0]["id"])
    done_id = int(board["columns"][4]["id"])
    reply(
        monkeypatch,
        "Updated the board.",
        [
            {"type": "update_board", "name": "Roadmap"},
            {"type": "rename_column", "columnId": column_id, "title": "Ideas"},
            {"type": "create_card", "columnId": column_id, "title": "AI task", "details": "New"},
            {"type": "create_column", "title": "Blocked"},
            {"type": "move_column", "columnId": done_id, "position": 0},
        ],
    )
    response = await chat(client, board["id"])
    persisted = (await client.get(f"/api/boards/{board['id']}")).json()

    assert response.status_code == 200
    updated = response.json()["board"]
    assert updated == persisted
    assert updated["name"] == "Roadmap"
    assert [column["title"] for column in updated["columns"]] == [
        "Done",
        "Ideas",
        "Discovery",
        "In Progress",
        "Review",
        "Blocked",
    ]
    assert any(card["title"] == "AI task" for card in updated["cards"].values())


async def test_chat_can_delete_a_column_with_its_cards(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await login(client)
    board = await first_board(client)
    backlog = board["columns"][0]
    reply(monkeypatch, "Removed.", [{"type": "delete_column", "columnId": int(backlog["id"])}])
    updated = (await chat(client, board["id"])).json()["board"]

    assert len(updated["columns"]) == 4
    assert not set(backlog["cardIds"]) & set(updated["cards"])


ResponseFactory = Callable[[dict], str]

INVALID_REPLIES: list[ResponseFactory] = [
    lambda _board: "not json",
    lambda _board: json.dumps({"version": 2, "assistantText": "Wrong version", "operations": []}),
    lambda board: json.dumps(
        {
            "version": 1,
            "assistantText": "Changing cards.",
            "operations": [
                {"type": "rename_column", "columnId": int(board["columns"][0]["id"]), "title": "X"},
                {"type": "delete_card", "cardId": 999999},
            ],
        }
    ),
    lambda board: json.dumps(
        {
            "version": 1,
            "assistantText": "Renaming.",
            "operations": [
                {"type": "rename_column", "columnId": int(board["columns"][0]["id"]), "title": " "}
            ],
        }
    ),
    lambda _board: json.dumps(
        {"version": 1, "assistantText": "Unknown.", "operations": [{"type": "drop_table"}]}
    ),
]


@pytest.mark.parametrize("make_reply", INVALID_REPLIES)
async def test_chat_rejects_malformed_or_invalid_changes_without_persistence(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch, make_reply: ResponseFactory
) -> None:
    await login(client)
    board = await first_board(client)
    monkeypatch.setattr(ai, "ask_openrouter", lambda _messages, _format: make_reply(board))
    response = await chat(client, board["id"])

    assert response.status_code == 502
    assert (await client.get(f"/api/boards/{board['id']}")).json() == board


async def test_chat_reports_openrouter_failures(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing_openrouter(_messages: object, _format: object) -> str:
        raise ai.OpenRouterError("OpenRouter is unavailable.")

    monkeypatch.setattr(ai, "ask_openrouter", failing_openrouter)
    await login(client)
    board = await first_board(client)

    assert (await chat(client, board["id"])).status_code == 502


async def test_chat_cannot_touch_another_users_board(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await login(client)
    own_board = await first_board(client)
    reply(monkeypatch, "Deleted.", [{"type": "delete_card", "cardId": 1}])
    async with new_client() as intruder:
        await register(intruder, "intruder")
        intruder_board = await first_board(intruder)
        foreign_board = await chat(intruder, own_board["id"])
        reply(
            monkeypatch,
            "Deleted.",
            [{"type": "delete_card", "cardId": int(own_board["columns"][0]["cardIds"][0])}],
        )
        foreign_card = await chat(intruder, intruder_board["id"])

    assert foreign_board.status_code == 404
    assert foreign_card.status_code == 502
    assert (await client.get(f"/api/boards/{own_board['id']}")).json() == own_board


async def test_chat_requires_authentication(client: httpx.AsyncClient) -> None:
    assert (await chat(client, "1")).status_code == 401
