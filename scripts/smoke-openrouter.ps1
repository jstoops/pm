$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $projectRoot
try {
    docker compose run --build --rm app uv run python -m app.openrouter_smoke
    if ($LASTEXITCODE -ne 0) {
        throw "OpenRouter smoke test failed."
    }
}
finally {
    Pop-Location
}