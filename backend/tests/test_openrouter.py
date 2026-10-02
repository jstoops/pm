"""OpenRouter client tests. httpx.post is replaced, so no request leaves the process."""

from collections.abc import Callable

import httpx
import pytest

from app import openrouter

MESSAGES = [{"role": "user", "content": "2+2"}]


def fake_post(
    monkeypatch: pytest.MonkeyPatch, respond: Callable[[httpx.Request], httpx.Response]
) -> list[httpx.Request]:
    """Routes httpx.post through a mock transport and records each request."""
    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return respond(request)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(openrouter.httpx, "post", client.post)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    return sent


def completion(content: object) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def test_returns_stripped_content_and_sends_model_and_format(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent = fake_post(monkeypatch, lambda _request: completion("  4\n"))

    assert openrouter.ask_openrouter(MESSAGES, {"type": "json_object"}) == "4"
    request = sent[0]
    assert request.url == openrouter.OPENROUTER_URL
    assert request.headers["Authorization"] == "Bearer test-key"
    body = httpx.Response(200, content=request.content).json()
    assert body == {
        "model": openrouter.OPENROUTER_MODEL,
        "messages": MESSAGES,
        "response_format": {"type": "json_object"},
    }


def test_requires_an_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(openrouter.OpenRouterError, match="not configured"):
        openrouter.ask_openrouter(MESSAGES)


def raise_timeout(request: httpx.Request) -> httpx.Response:
    raise httpx.ReadTimeout("slow", request=request)


@pytest.mark.parametrize(
    ("respond", "message"),
    [
        (raise_timeout, "did not respond"),
        (lambda _request: httpx.Response(429), "rate limited"),
        (lambda _request: httpx.Response(500), "HTTP 500"),
        (lambda _request: httpx.Response(200, text="not json"), "invalid response"),
        (lambda _request: httpx.Response(200, json={"choices": []}), "invalid response"),
        (lambda _request: completion("   "), "empty response"),
        (lambda _request: completion(None), "empty response"),
    ],
)
def test_reports_actionable_errors(
    monkeypatch: pytest.MonkeyPatch,
    respond: Callable[[httpx.Request], httpx.Response],
    message: str,
) -> None:
    fake_post(monkeypatch, respond)

    with pytest.raises(openrouter.OpenRouterError, match=message):
        openrouter.ask_openrouter(MESSAGES)
