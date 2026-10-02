import httpx
import pytest
from conftest import first_board, login, new_client, register

pytestmark = pytest.mark.anyio


def card_titles(board: dict, column_index: int) -> list[str]:
    column = board["columns"][column_index]
    return [board["cards"][card_id]["title"] for card_id in column["cardIds"]]


def column_titles(board: dict) -> list[str]:
    return [column["title"] for column in board["columns"]]


async def test_board_routes_require_authentication(client: httpx.AsyncClient) -> None:
    responses = [
        await client.get("/api/boards"),
        await client.post("/api/boards", json={"name": "Nope"}),
        await client.get("/api/boards/1"),
        await client.post("/api/boards/1/cards", json={"column_id": 1, "title": "Nope"}),
    ]

    assert [response.status_code for response in responses] == [401] * 4


async def test_boards_can_be_created_listed_renamed_and_deleted(
    client: httpx.AsyncClient,
) -> None:
    await login(client)
    created = await client.post(
        "/api/boards", json={"name": "  Launch plan ", "description": "Q4 launch"}
    )
    board = created.json()
    renamed = await client.patch(f"/api/boards/{board['id']}", json={"name": "Launch"})
    described = await client.patch(
        f"/api/boards/{board['id']}", json={"description": "Updated"}
    )
    empty_change = await client.patch(f"/api/boards/{board['id']}", json={})
    blank_name = await client.patch(f"/api/boards/{board['id']}", json={"name": " "})
    listed = (await client.get("/api/boards")).json()
    deleted = await client.delete(f"/api/boards/{board['id']}")
    after_delete = (await client.get("/api/boards")).json()
    missing = await client.get(f"/api/boards/{board['id']}")

    assert created.status_code == 201
    assert board["name"] == "Launch plan"
    assert column_titles(board) == ["Backlog", "Discovery", "In Progress", "Review", "Done"]
    assert board["cards"] == {}
    assert renamed.json()["name"] == "Launch"
    assert described.json() | {"columns": None} == {
        "id": board["id"],
        "name": "Launch",
        "description": "Updated",
        "columns": None,
        "cards": {},
    }
    assert empty_change.status_code == 422
    assert blank_name.status_code == 422
    assert [(item["name"], item["cardCount"]) for item in listed] == [
        ("My first board", 8),
        ("Launch", 0),
    ]
    assert deleted.status_code == 204
    assert [item["name"] for item in after_delete] == ["My first board"]
    assert missing.status_code == 404


async def test_card_mutations_persist_for_a_new_session(client: httpx.AsyncClient) -> None:
    await login(client)
    board = await first_board(client)
    base = f"/api/boards/{board['id']}"
    first_column, second_column = board["columns"][:2]

    created = await client.post(
        f"{base}/cards",
        json={"column_id": int(first_column["id"]), "title": "Persisted", "details": "API"},
    )
    card_id = created.json()["columns"][0]["cardIds"][-1]
    updated = await client.patch(
        f"{base}/cards/{card_id}", json={"title": "Updated", "details": "Edited."}
    )
    moved = await client.post(
        f"{base}/cards/{card_id}/move",
        json={"column_id": int(second_column["id"]), "position": 0},
    )

    assert created.status_code == 201
    assert updated.json()["cards"][card_id] == {
        "id": card_id,
        "title": "Updated",
        "details": "Edited.",
    }
    assert moved.json()["columns"][1]["cardIds"][0] == card_id

    async with new_client() as other:
        await login(other)
        persisted = (await other.get(base)).json()
        deleted = await other.delete(f"{base}/cards/{card_id}")
    assert persisted["columns"][1]["cardIds"][0] == card_id
    assert card_id not in deleted.json()["cards"]


async def test_moving_cards_keeps_positions_contiguous(client: httpx.AsyncClient) -> None:
    await login(client)
    board = await first_board(client)
    base = f"/api/boards/{board['id']}"
    first_ids = board["columns"][0]["cardIds"]

    within = (
        await client.post(
            f"{base}/cards/{first_ids[1]}/move",
            json={"column_id": int(board["columns"][0]["id"]), "position": 0},
        )
    ).json()
    past_end = (
        await client.post(
            f"{base}/cards/{first_ids[1]}/move",
            json={"column_id": int(board["columns"][2]["id"]), "position": 99},
        )
    ).json()

    assert within["columns"][0]["cardIds"] == [first_ids[1], first_ids[0]]
    assert past_end["columns"][0]["cardIds"] == [first_ids[0]]
    assert past_end["columns"][2]["cardIds"][-1] == first_ids[1]


async def test_columns_can_be_added_renamed_moved_and_deleted(
    client: httpx.AsyncClient,
) -> None:
    await login(client)
    board = await first_board(client)
    base = f"/api/boards/{board['id']}"

    added = await client.post(f"{base}/columns", json={"title": " Blocked "})
    new_column_id = added.json()["columns"][-1]["id"]
    renamed = await client.patch(f"{base}/columns/{new_column_id}", json={"title": "On hold"})
    moved = await client.post(f"{base}/columns/{new_column_id}/move", json={"position": 1})
    backlog = board["columns"][0]
    deleted = await client.delete(f"{base}/columns/{backlog['id']}")
    remaining = deleted.json()

    assert added.status_code == 201
    assert column_titles(added.json())[-1] == "Blocked"
    assert column_titles(renamed.json())[-1] == "On hold"
    assert column_titles(moved.json()) == [
        "Backlog",
        "On hold",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert column_titles(remaining) == ["On hold", "Discovery", "In Progress", "Review", "Done"]
    assert not set(backlog["cardIds"]) & set(remaining["cards"])
    # Positions stay contiguous, so a new column lands at the end.
    appended = (await client.post(f"{base}/columns", json={"title": "Archive"})).json()
    assert column_titles(appended)[-1] == "Archive"
    assert len(appended["columns"]) == 6


async def test_invalid_requests_leave_the_board_unchanged(client: httpx.AsyncClient) -> None:
    await login(client)
    board = await first_board(client)
    base = f"/api/boards/{board['id']}"
    column_id = board["columns"][0]["id"]
    card_id = board["columns"][0]["cardIds"][0]

    responses = [
        await client.patch(f"{base}/columns/{column_id}", json={"title": "   "}),
        await client.post(f"{base}/columns", json={"title": ""}),
        await client.post(f"{base}/cards", json={"column_id": int(column_id), "title": "  "}),
        await client.patch(f"{base}/cards/{card_id}", json={"title": " "}),
        await client.patch(f"{base}/cards/{card_id}", json={}),
        await client.post(
            f"{base}/cards/{card_id}/move", json={"column_id": int(column_id), "position": -1}
        ),
        await client.post(f"{base}/columns/{column_id}/move", json={"position": -1}),
    ]
    not_found = [
        await client.patch(f"{base}/cards/999999", json={"title": "Nope"}),
        await client.delete(f"{base}/columns/999999"),
        await client.post(f"{base}/cards", json={"column_id": 999999, "title": "Nope"}),
        await client.post(f"{base}/cards/{card_id}/move", json={"column_id": 999999, "position": 0}),
    ]

    assert [response.status_code for response in responses] == [422] * 7
    assert [response.status_code for response in not_found] == [404] * 4
    assert (await client.get(base)).json() == board


async def test_users_cannot_reach_each_others_boards(client: httpx.AsyncClient) -> None:
    await login(client)
    own_board = await first_board(client)
    async with new_client() as intruder:
        await register(intruder, "intruder")
        intruder_board = await first_board(intruder)
        foreign = f"/api/boards/{own_board['id']}"
        own_column = own_board["columns"][0]["id"]
        own_card = own_board["columns"][0]["cardIds"][0]
        intruder_base = f"/api/boards/{intruder_board['id']}"
        responses = [
            await intruder.get(foreign),
            await intruder.patch(foreign, json={"name": "Stolen"}),
            await intruder.delete(foreign),
            await intruder.post(f"{foreign}/columns", json={"title": "Stolen"}),
            await intruder.post(f"{foreign}/cards", json={"column_id": int(own_column), "title": "X"}),
            # Ids from another board are rejected even through the intruder's own board.
            await intruder.patch(f"{intruder_base}/cards/{own_card}", json={"title": "Stolen"}),
            await intruder.delete(f"{intruder_base}/columns/{own_column}"),
            await intruder.post(
                f"{intruder_base}/cards/{intruder_board['columns'][0]['cardIds'][0]}/move",
                json={"column_id": int(own_column), "position": 0},
            ),
        ]
        intruder_boards = (await intruder.get("/api/boards")).json()

    assert [response.status_code for response in responses] == [404] * 8
    assert [board["id"] for board in intruder_boards] == [intruder_board["id"]]
    assert (await client.get(f"/api/boards/{own_board['id']}")).json() == own_board
