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
    assert "Kanban Studio" in response.text


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
async def test_example_returns_message() -> None:
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        response = await client.get("/api/example")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Project Management MVP API is running."
    }