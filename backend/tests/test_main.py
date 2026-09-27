from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_root_serves_static_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Project Management MVP" in response.text


def test_health_returns_ok() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_example_returns_message() -> None:
    response = client.get("/api/example")

    assert response.status_code == 200
    assert response.json() == {
        "message": "Project Management MVP API is running."
    }