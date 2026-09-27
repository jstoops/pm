from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


STATIC_DIRECTORY = Path(__file__).parent / "static"

app = FastAPI(title="Project Management MVP API")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/example")
def example() -> dict[str, str]:
    return {"message": "Project Management MVP API is running."}


app.mount("/", StaticFiles(directory=STATIC_DIRECTORY, html=True), name="static")
