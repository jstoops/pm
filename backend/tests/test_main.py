import httpx
import pytest

from app.main import app


@pytest.mark.anyio
async def test_root_serves_static_page() -> None:
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get("/")

    assert response.status_code == 200
    assert "Welcome back" in response.text


@pytest.mark.anyio
async def test_login_grants_board_access_and_logout_revokes_it() -> None:
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        login_response = await client.post(
            "/api/auth/login",
            json={"username": "user", "password": "password"},
        )
        session_response = await client.get("/api/auth/session")
        board_response = await client.get("/")
        logout_response = await client.post("/api/auth/logout")
        revoked_session_response = await client.get("/api/auth/session")
        login_page_response = await client.get("/")

    assert login_response.json() == {"authenticated": True}
    assert session_response.json() == {"authenticated": True}
    assert "Kanban Studio" in board_response.text
    assert logout_response.status_code == 204
    assert revoked_session_response.json() == {"authenticated": False}
    assert "Welcome back" in login_page_response.text


@pytest.mark.anyio
async def test_login_rejects_invalid_credentials() -> None:
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/auth/login",
            json={"username": "user", "password": "incorrect"},
        )
        session_response = await client.get("/api/auth/session")

    assert response.status_code == 401
    assert session_response.json() == {"authenticated": False}


@pytest.mark.anyio
async def test_health_returns_ok() -> None:
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_favicon_is_served() -> None:
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get("/favicon.ico")

    assert response.status_code == 200
