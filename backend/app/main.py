import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from app.ai import AIOutputError, ChatRequest, request_ai_update
from app.database import (
    BoardItemNotFoundError,
    apply_operations,
    authenticate_mvp_user,
    board_data,
    initialize_database,
)
from app.operations import (
    BoardOperation,
    CardChanges,
    CardDetails,
    CardTitle,
    ColumnTitle,
    CreateCard,
    DeleteCard,
    MoveCard,
    RenameColumn,
    UpdateCard,
)

STATIC_DIRECTORY = Path(__file__).parent / "static"
SESSION_SECRET = os.environ.get("SESSION_SECRET", secrets.token_urlsafe(32))
SESSION_HTTPS_ONLY = os.environ.get("SESSION_HTTPS_ONLY", "false").lower() == "true"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    initialize_database()
    yield


app = FastAPI(title="Project Management MVP API", lifespan=lifespan)
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
    title: ColumnTitle


class CardCreateRequest(BaseModel):
    column_id: int
    title: CardTitle
    details: CardDetails = ""


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


UserId = Annotated[int, Depends(require_authenticated)]


def change_board(user_id: int, operation: BoardOperation) -> dict[str, object]:
    try:
        return apply_operations(user_id, [operation])
    except BoardItemNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@app.get("/", include_in_schema=False)
def home(request: Request) -> FileResponse:
    page = "index.html" if is_authenticated(request) else "login/index.html"
    return FileResponse(STATIC_DIRECTORY / page)


@app.get("/login", include_in_schema=False)
def login_page(request: Request) -> Response:
    if is_authenticated(request):
        return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    return FileResponse(STATIC_DIRECTORY / "login/index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(STATIC_DIRECTORY / "favicon.ico")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
def get_board(user_id: UserId) -> dict[str, object]:
    return board_data(user_id)


@app.post("/api/chat")
def chat_with_board_ai(payload: ChatRequest, user_id: UserId) -> dict[str, object]:
    try:
        output, updated_board = request_ai_update(user_id, payload)
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
    column_id: int, payload: ColumnRenameRequest, user_id: UserId
) -> dict[str, object]:
    return change_board(user_id, RenameColumn(columnId=column_id, title=payload.title))


@app.post("/api/board/cards", status_code=status.HTTP_201_CREATED)
def create_board_card(payload: CardCreateRequest, user_id: UserId) -> dict[str, object]:
    return change_board(
        user_id,
        CreateCard(columnId=payload.column_id, title=payload.title, details=payload.details),
    )


@app.patch("/api/board/cards/{card_id}")
def update_board_card(card_id: int, payload: CardChanges, user_id: UserId) -> dict[str, object]:
    return change_board(
        user_id, UpdateCard(cardId=card_id, title=payload.title, details=payload.details)
    )


@app.delete("/api/board/cards/{card_id}")
def delete_board_card(card_id: int, user_id: UserId) -> dict[str, object]:
    return change_board(user_id, DeleteCard(cardId=card_id))


@app.post("/api/board/cards/{card_id}/move")
def move_board_card(card_id: int, payload: CardMoveRequest, user_id: UserId) -> dict[str, object]:
    return change_board(
        user_id,
        MoveCard(cardId=card_id, columnId=payload.column_id, position=payload.position),
    )


app.mount(
    "/_next",
    StaticFiles(directory=STATIC_DIRECTORY / "_next", check_dir=False),
    name="next-assets",
)
