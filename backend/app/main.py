from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse


STATIC_DIRECTORY = Path(__file__).parent / "static"

app = FastAPI(title="Project Management MVP API")


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(STATIC_DIRECTORY / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/example")
def example() -> dict[str, str]:
    return {"message": "Project Management MVP API is running."}
