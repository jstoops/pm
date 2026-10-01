from pathlib import Path

import pytest

from app import database


@pytest.fixture(autouse=True)
def database_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "project_management.db"
    monkeypatch.setattr(database, "DATABASE_PATH", path)
    database.initialize_database()
    return path
