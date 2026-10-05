import os
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints
from starlette.middleware.sessions import SessionMiddleware

from app import database
from app.ai import AIOutputError, ChatRequest, request_ai_update
from app.database import BoardItemNotFoundError, UsernameTakenError
from app.operations import (
    BoardChanges,
    BoardDescription,
    BoardName,
    CardChanges,
    CardDetails,
    CardTitle,
    ColumnTitle,
    CreateCard,
    CreateColumn,
    DeleteCard,
    DeleteColumn,
    MoveCard,
    MoveColumn,
    RenameColumn,
    UpdateBoard,
    UpdateCard,
)

STATIC_DIRECTORY = Path(__file__).parent / "static"
SESSION_SECRET = os.environ.get("SESSION_SECRET", secrets.token_urlsafe(32))
SESSION_HTTPS_ONLY = os.environ.get("SESSION_HTTPS_ONLY", "false").lower() == "true"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    database.initialize_database()
    yield


app = FastAPI(title="Project Management API", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=60 * 60 * 8,
    same_site="lax",
    https_only=SESSION_HTTPS_ONLY,
)

Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, to_lower=True, min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$"
    ),
]
NewPassword = Annotated[str, Field(min_length=8, max_length=256)]


class LoginRequest(BaseModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True)]
    password: str


class RegisterRequest(BaseModel):
    username: Username
    password: NewPassword


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: NewPassword


class AccountDeleteRequest(BaseModel):
    password: str


class BoardCreateRequest(BaseModel):
    name: BoardName
    description: BoardDescription = ""


class ColumnRequest(BaseModel):
    title: ColumnTitle


class PositionRequest(BaseModel):
    position: int = Field(ge=0)


class CardCreateRequest(BaseModel):
    column_id: int
    title: CardTitle
    details: CardDetails = ""


class CardMoveRequest(PositionRequest):
    column_id: int


def session_user_id(request: Request) -> int | None:
    """Returns the signed-in user's id, clearing sessions whose account was deleted."""
    user_id = request.session.get("user_id")
    if not isinstance(user_id, int):
        return None
    if database.account(user_id) is None:
        request.session.clear()
        return None
    return user_id


def require_authenticated(request: Request) -> int:
    user_id = session_user_id(request)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        )
    return user_id


UserId = Annotated[int, Depends(require_authenticated)]


@app.exception_handler(BoardItemNotFoundError)
def board_item_not_found(_request: Request, error: BoardItemNotFoundError) -> JSONResponse:
    """Any board, column or card outside the user's boards is a 404, from every route."""
    return JSONResponse({"detail": str(error)}, status_code=status.HTTP_404_NOT_FOUND)


def page(request: Request, name: str, *, signed_in: bool) -> Response:
    """Serves a static page to visitors in the matching session state, else redirects."""
    if (session_user_id(request) is not None) != signed_in:
        return RedirectResponse(
            url="/login" if signed_in else "/", status_code=status.HTTP_303_SEE_OTHER
        )
    return FileResponse(STATIC_DIRECTORY / name)


@app.get("/", include_in_schema=False)
def home(request: Request) -> FileResponse:
    name = "index.html" if session_user_id(request) is not None else "login/index.html"
    return FileResponse(STATIC_DIRECTORY / name)


@app.get("/login", include_in_schema=False)
def login_page(request: Request) -> Response:
    return page(request, "login/index.html", signed_in=False)


@app.get("/register", include_in_schema=False)
def register_page(request: Request) -> Response:
    return page(request, "register/index.html", signed_in=False)


@app.get("/account", include_in_schema=False)
def account_page(request: Request) -> Response:
    return page(request, "account/index.html", signed_in=True)


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> FileResponse:
    return FileResponse(STATIC_DIRECTORY / "favicon.ico")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/session")
def session_status(request: Request) -> dict[str, object]:
    user_id = session_user_id(request)
    if user_id is None:
        return {"authenticated": False}
    return {"authenticated": True, "username": database.account(user_id)["username"]}


@app.post("/api/auth/login")
def login(credentials: LoginRequest, request: Request) -> dict[str, bool]:
    user_id = database.authenticate(credentials.username, credentials.password)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    request.session["user_id"] = user_id
    return {"authenticated": True}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request) -> dict[str, bool]:
    try:
        user_id = database.create_user(payload.username, payload.password)
    except UsernameTakenError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    request.session["user_id"] = user_id
    return {"authenticated": True}


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/account")
def get_account(user_id: UserId) -> dict[str, object]:
    return database.account(user_id)


@app.post("/api/account/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: PasswordChangeRequest, user_id: UserId) -> Response:
    if not database.change_password(user_id, payload.current_password, payload.new_password):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect."
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/account/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(payload: AccountDeleteRequest, request: Request, user_id: UserId) -> Response:
    if not database.delete_user(user_id, payload.password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password is incorrect.")
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/boards")
def list_boards(user_id: UserId) -> list[dict[str, object]]:
    return database.list_boards(user_id)


@app.post("/api/boards", status_code=status.HTTP_201_CREATED)
def create_board(payload: BoardCreateRequest, user_id: UserId) -> dict[str, object]:
    return database.create_board(user_id, payload.name, payload.description)


@app.get("/api/boards/{board_id}")
def get_board(board_id: int, user_id: UserId) -> dict[str, object]:
    return database.board_data(user_id, board_id)


@app.patch("/api/boards/{board_id}")
def update_board(board_id: int, payload: BoardChanges, user_id: UserId) -> dict[str, object]:
    return database.apply_operations(
        user_id, board_id, [UpdateBoard(name=payload.name, description=payload.description)]
    )


@app.delete("/api/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(board_id: int, user_id: UserId) -> Response:
    database.delete_board(user_id, board_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/boards/{board_id}/chat")
def chat_with_board_ai(board_id: int, payload: ChatRequest, user_id: UserId) -> dict[str, object]:
    try:
        output, updated_board = request_ai_update(user_id, board_id, payload)
    except AIOutputError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)
        ) from error
    response: dict[str, object] = {"assistantText": output.assistant_text}
    if updated_board is not None:
        response["board"] = updated_board
    return response


@app.post("/api/boards/{board_id}/columns", status_code=status.HTTP_201_CREATED)
def create_board_column(
    board_id: int, payload: ColumnRequest, user_id: UserId
) -> dict[str, object]:
    return database.apply_operations(user_id, board_id, [CreateColumn(title=payload.title)])


@app.patch("/api/boards/{board_id}/columns/{column_id}")
def rename_board_column(
    board_id: int, column_id: int, payload: ColumnRequest, user_id: UserId
) -> dict[str, object]:
    return database.apply_operations(
        user_id, board_id, [RenameColumn(columnId=column_id, title=payload.title)]
    )


@app.post("/api/boards/{board_id}/columns/{column_id}/move")
def move_board_column(
    board_id: int, column_id: int, payload: PositionRequest, user_id: UserId
) -> dict[str, object]:
    return database.apply_operations(
        user_id, board_id, [MoveColumn(columnId=column_id, position=payload.position)]
    )


@app.delete("/api/boards/{board_id}/columns/{column_id}")
def delete_board_column(board_id: int, column_id: int, user_id: UserId) -> dict[str, object]:
    return database.apply_operations(user_id, board_id, [DeleteColumn(columnId=column_id)])


@app.post("/api/boards/{board_id}/cards", status_code=status.HTTP_201_CREATED)
def create_board_card(
    board_id: int, payload: CardCreateRequest, user_id: UserId
) -> dict[str, object]:
    return database.apply_operations(
        user_id,
        board_id,
        [CreateCard(columnId=payload.column_id, title=payload.title, details=payload.details)],
    )


@app.patch("/api/boards/{board_id}/cards/{card_id}")
def update_board_card(
    board_id: int, card_id: int, payload: CardChanges, user_id: UserId
) -> dict[str, object]:
    return database.apply_operations(
        user_id,
        board_id,
        [UpdateCard(cardId=card_id, title=payload.title, details=payload.details)],
    )


@app.delete("/api/boards/{board_id}/cards/{card_id}")
def delete_board_card(board_id: int, card_id: int, user_id: UserId) -> dict[str, object]:
    return database.apply_operations(user_id, board_id, [DeleteCard(cardId=card_id)])


@app.post("/api/boards/{board_id}/cards/{card_id}/move")
def move_board_card(
    board_id: int, card_id: int, payload: CardMoveRequest, user_id: UserId
) -> dict[str, object]:
    return database.apply_operations(
        user_id,
        board_id,
        [MoveCard(cardId=card_id, columnId=payload.column_id, position=payload.position)],
    )


app.mount(
    "/_next",
    StaticFiles(directory=STATIC_DIRECTORY / "_next", check_dir=False),
    name="next-assets",
)
