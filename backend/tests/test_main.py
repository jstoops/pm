import httpx
import pytest
from conftest import login

pytestmark = pytest.mark.anyio


async def test_root_serves_login_until_signed_in(client: httpx.AsyncClient) -> None:
    signed_out = await client.get("/")
    await login(client)
    signed_in = await client.get("/")

    assert signed_out.status_code == 200
    assert "Welcome back" in signed_out.text
    assert "Kanban Studio" in signed_in.text
    assert "Welcome back" not in signed_in.text


async def test_signed_out_pages_redirect_signed_in_users(client: httpx.AsyncClient) -> None:
    login_page = await client.get("/login")
    register_page = await client.get("/register")
    account_redirect = await client.get("/account")
    await login(client)
    signed_in_login = await client.get("/login")
    signed_in_register = await client.get("/register")
    account_page = await client.get("/account")

    assert "Welcome back" in login_page.text
    assert "Create your account" in register_page.text
    assert account_redirect.status_code == 303
    assert account_redirect.headers["location"] == "/login"
    assert signed_in_login.headers["location"] == "/"
    assert signed_in_register.headers["location"] == "/"
    assert "Account settings" in account_page.text


async def test_health_returns_ok(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_favicon_is_served(client: httpx.AsyncClient) -> None:
    assert (await client.get("/favicon.ico")).status_code == 200
