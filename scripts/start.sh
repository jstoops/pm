#!/usr/bin/env sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(dirname -- "$script_dir")
port=${1:-8000}

cd "$project_root"
APP_PORT="$port" docker compose up --build --detach --wait
printf 'Project Management MVP is running at http://localhost:%s\n' "$port"