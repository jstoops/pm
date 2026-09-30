import os
import secrets
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from app.ai import AIOutputError, ChatRequest, request_ai_update
from app.database import (
    authenticate_mvp_user,
    board_data,
    create_card,
    delete_card,
    move_card,
    rename_column,
    update_card,
)

STATIC_DIRECTORY = Path(__file__).parent / "static"
SESSION_SECRET = os.environ.get("SESSION_SECRET", secrets.token_urlsafe(32))
SESSION_HTTPS_ONLY = os.environ.get("SESSION_HTTPS_ONLY", "false").lower() == "true"

app = FastAPI(title="Project Management MVP API")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=60 * 60 * 8,
    same_site="lax",
    https_only=SESSION_HTTPS_ONLY,
)


class LoginRequest(BaseModel):
    username: str
    password: str


class ColumnRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class CardCreateRequest(BaseModel):
    column_id: int
    title: str = Field(min_length=1, max_length=240)
    details: str = Field(default="", max_length=4000)


class CardUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    details: str | None = Field(default=None, max_length=4000)


class CardMoveRequest(BaseModel):
    column_id: int
    position: int = Field(ge=0)


def is_authenticated(request: Request) -> bool:
    return isinstance(request.session.get("user_id"), int)


def require_authenticated(request: Request) -> int:
    if not is_authenticated(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        )
    return request.session["user_id"]


@app.get("/", include_in_schema=False)
def home(request: Request) -> FileResponse:
    page = "index.html" if is_authenticated(request) else "login/index.html"
    return FileResponse(STATIC_DIRECTORY / page)


@app.get("/login", include_in_schema=False)
def login_page(request: Request) -> Response:
    if is_authenticated(request):
        return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    return FileResponse(STATIC_DIRECTORY / "login/index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/example")
def example() -> dict[str, str]:
    return {"message": "Project Management MVP API is running."}


@app.get("/api/auth/session")
def session_status(request: Request) -> dict[str, bool]:
    return {"authenticated": is_authenticated(request)}


@app.post("/api/auth/login")
def login(credentials: LoginRequest, request: Request) -> dict[str, bool]:
    user_id = authenticate_mvp_user(credentials.username, credentials.password)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    request.session["user_id"] = user_id
    return {"authenticated": True}


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/board")
def get_board(request: Request) -> dict[str, object]:
    return board_data(require_authenticated(request))


@app.post("/api/chat")
def chat_with_board_ai(payload: ChatRequest, request: Request) -> dict[str, object]:
    try:
        output, updated_board = request_ai_update(require_authenticated(request), payload)
    except AIOutputError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
    response: dict[str, object] = {"assistantText": output.assistant_text}
    if updated_board is not None:
        response["board"] = updated_board
    return response


@app.patch("/api/board/columns/{column_id}")
def rename_board_column(
    column_id: int, payload: ColumnRenameRequest, request: Request
) -> dict[str, object]:
    if not rename_column(require_authenticated(request), column_id, payload.title.strip()):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found.")
    return board_data(require_authenticated(request))


@app.post("/api/board/cards", status_code=status.HTTP_201_CREATED)
def create_board_card(payload: CardCreateRequest, request: Request) -> dict[str, object]:
    if create_card(
        require_authenticated(request),
        payload.column_id,
        payload.title.strip(),
        payload.details,
    ) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found.")
    return board_data(require_authenticated(request))


@app.patch("/api/board/cards/{card_id}")
def update_board_card(
    card_id: int, payload: CardUpdateRequest, request: Request
) -> dict[str, object]:
    if payload.title is None and payload.details is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No changes provided.")
    title = payload.title.strip() if payload.title is not None else None
    if title == "":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Title is required.")
    if not update_card(require_authenticated(request), card_id, title, payload.details):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found.")
    return board_data(require_authenticated(request))


@app.delete("/api/board/cards/{card_id}")
def delete_board_card(card_id: int, request: Request) -> dict[str, object]:
    if not delete_card(require_authenticated(request), card_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found.")
    return board_data(require_authenticated(request))


@app.post("/api/board/cards/{card_id}/move")
def move_board_card(
    card_id: int, payload: CardMoveRequest, request: Request
) -> dict[str, object]:
    if not move_card(
        require_authenticated(request), card_id, payload.column_id, payload.position
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card or column not found.")
    return board_data(require_authenticated(request))


app.mount(
    "/_next",
    StaticFiles(directory=STATIC_DIRECTORY / "_next", check_dir=False),
    name="next-assets",
)
