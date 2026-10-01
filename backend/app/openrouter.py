import os

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
REQUEST_TIMEOUT_SECONDS = 30.0


class OpenRouterError(RuntimeError):
    pass


def ask_openrouter(
    messages: list[dict[str, str]], response_format: dict[str, object] | None = None
) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured.")

    payload: dict[str, object] = {"model": OPENROUTER_MODEL, "messages": messages}
    if response_format is not None:
        payload["response_format"] = response_format
    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
    except httpx.TimeoutException as error:
        raise OpenRouterError("OpenRouter did not respond within 30 seconds.") from error
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 429:
            raise OpenRouterError(
                "The configured free model is rate limited or temporarily unavailable. Retry later."
            ) from error
        raise OpenRouterError(
            f"OpenRouter returned HTTP {error.response.status_code}."
        ) from error
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        raise OpenRouterError("OpenRouter returned an invalid response.") from error

    if not isinstance(content, str) or not content.strip():
        raise OpenRouterError("OpenRouter returned an empty response.")
    return content.strip()