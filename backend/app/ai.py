import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.database import BoardItemNotFoundError, apply_operations, board_data
from app.openrouter import OpenRouterError, ask_openrouter
from app.operations import BoardOperation

MAX_HISTORY_MESSAGES = 12


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ConversationMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)


class AIOutput(BaseModel):
    version: Literal[1]
    assistant_text: str = Field(alias="assistantText", min_length=1, max_length=4000)
    operations: list[BoardOperation] = Field(default_factory=list, max_length=20)


RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "board_assistant_response",
        "schema": AIOutput.model_json_schema(by_alias=True),
    },
}

SYSTEM_PROMPT = (
    "You manage a Kanban board. Reply only with JSON matching this schema: "
    '{"version":1,"assistantText":"string","operations":[]}. '
    "Operations may be update_board(name?,description?), create_column(title), "
    "rename_column(columnId,title), move_column(columnId,position), delete_column(columnId), "
    "create_card(columnId,title,details), update_card(cardId,title?,details?), "
    "move_card(cardId,columnId,position), or delete_card(cardId). "
    "Deleting a column also deletes its cards. "
    "Use only numeric IDs present in the provided board. "
    "position is the zero-based index the item should occupy after the move. "
    "Return an empty operations list when no board change is needed."
)


class AIOutputError(ValueError):
    pass


def request_ai_update(
    user_id: int, board_id: int, request: ChatRequest
) -> tuple[AIOutput, dict[str, object] | None]:
    """Raises BoardItemNotFoundError if the board is not the user's."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "board": board_data(user_id, board_id),
                    "history": [message.model_dump() for message in request.history],
                    "question": request.message,
                }
            ),
        },
    ]
    try:
        output = AIOutput.model_validate_json(ask_openrouter(messages, RESPONSE_FORMAT))
    except (OpenRouterError, ValidationError) as error:
        raise AIOutputError("The AI response could not be processed.") from error

    if not output.operations:
        return output, None
    try:
        return output, apply_operations(user_id, board_id, output.operations)
    except BoardItemNotFoundError as error:
        raise AIOutputError("The AI response requested an invalid board change.") from error
