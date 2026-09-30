import json
from typing import Annotated, Literal

from pydantic import BaseModel, Field, ValidationError, model_validator

from app.database import AICommandError, apply_ai_operations, board_data
from app.openrouter import OpenRouterError, ask_openrouter

MAX_HISTORY_MESSAGES = 12


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[ConversationMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)


class RenameColumnOperation(BaseModel):
    type: Literal["rename_column"]
    column_id: int = Field(alias="columnId", ge=1)
    title: str = Field(min_length=1, max_length=120)


class CreateCardOperation(BaseModel):
    type: Literal["create_card"]
    column_id: int = Field(alias="columnId", ge=1)
    title: str = Field(min_length=1, max_length=240)
    details: str = Field(default="", max_length=4000)


class UpdateCardOperation(BaseModel):
    type: Literal["update_card"]
    card_id: int = Field(alias="cardId", ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=240)
    details: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def requires_change(self) -> "UpdateCardOperation":
        if self.title is None and self.details is None:
            raise ValueError("update_card requires title or details")
        return self


class MoveCardOperation(BaseModel):
    type: Literal["move_card"]
    card_id: int = Field(alias="cardId", ge=1)
    column_id: int = Field(alias="columnId", ge=1)
    position: int = Field(ge=0)


class DeleteCardOperation(BaseModel):
    type: Literal["delete_card"]
    card_id: int = Field(alias="cardId", ge=1)


BoardOperation = Annotated[
    RenameColumnOperation
    | CreateCardOperation
    | UpdateCardOperation
    | MoveCardOperation
    | DeleteCardOperation,
    Field(discriminator="type"),
]


class AIOutput(BaseModel):
    version: Literal[1]
    assistant_text: str = Field(alias="assistantText", min_length=1, max_length=4000)
    operations: list[BoardOperation] = Field(default_factory=list, max_length=20)


class AIOutputError(ValueError):
    pass


def request_ai_update(user_id: int, request: ChatRequest) -> tuple[AIOutput, dict[str, object] | None]:
    board = board_data(user_id)
    messages = [
        {
            "role": "system",
            "content": (
                "You manage a Kanban board. Reply only with JSON matching this schema: "
                '{"version":1,"assistantText":"string","operations":[]}. '
                "Operations may be rename_column(columnId,title), create_card(columnId,title,details), "
                "update_card(cardId,title?,details?), move_card(cardId,columnId,position), or delete_card(cardId). "
                "Use only numeric IDs present in the provided board."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "board": board,
                    "history": [message.model_dump() for message in request.history],
                    "question": request.message,
                }
            ),
        },
    ]
    try:
        output = AIOutput.model_validate_json(ask_openrouter(messages))
    except (OpenRouterError, ValidationError) as error:
        raise AIOutputError("The AI response could not be processed.") from error

    if output.operations:
        try:
            apply_ai_operations(
                user_id,
                [operation.model_dump(by_alias=True, exclude_none=True) for operation in output.operations],
            )
        except AICommandError as error:
            raise AIOutputError("The AI response requested an invalid board change.") from error
        return output, board_data(user_id)
    return output, None