from app.openrouter import OpenRouterError, ask_openrouter


def main() -> None:
    try:
        print(
            ask_openrouter(
                [{"role": "user", "content": "What is 2+2? Reply with only the answer."}]
            )
        )
    except OpenRouterError as error:
        raise SystemExit(f"OpenRouter smoke test failed: {error}") from error


if __name__ == "__main__":
    main()