import os
import secrets
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware


STATIC_DIRECTORY = Path(__file__).parent / "static"
SESSION_SECRET = os.environ.get("SESSION_SECRET", secrets.token_urlsafe(32))

app = FastAPI(title="Project Management MVP API")
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=60 * 60 * 8,
    same_site="lax",
    https_only=False,
)


class LoginRequest(BaseModel):
    username: str
    password: str


def is_authenticated(request: Request) -> bool:
    return request.session.get("username") == "user"


def require_authenticated(request: Request) -> None:
    if not is_authenticated(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication is required.",
        )


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
    if credentials.username != "user" or credentials.password != "password":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    request.session["username"] = credentials.username
    return {"authenticated": True}


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


app.mount(
    "/_next",
    StaticFiles(directory=STATIC_DIRECTORY / "_next", check_dir=False),
    name="next-assets",
)
