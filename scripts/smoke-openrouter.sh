#!/usr/bin/env sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(dirname -- "$script_dir")

cd "$project_root"
docker compose run --build --rm app uv run python -m app.openrouter_smoke