from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

ColumnTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
CardTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
CardDetails = Annotated[str, Field(max_length=4000)]


class CardChanges(BaseModel):
    title: CardTitle | None = None
    details: CardDetails | None = None

    @model_validator(mode="after")
    def requires_change(self) -> "CardChanges":
        if self.title is None and self.details is None:
            raise ValueError("title or details is required")
        return self


class RenameColumn(BaseModel):
    type: Literal["rename_column"] = "rename_column"
    column_id: int = Field(alias="columnId")
    title: ColumnTitle


class CreateCard(BaseModel):
    type: Literal["create_card"] = "create_card"
    column_id: int = Field(alias="columnId")
    title: CardTitle
    details: CardDetails = ""


class UpdateCard(CardChanges):
    type: Literal["update_card"] = "update_card"
    card_id: int = Field(alias="cardId")


class MoveCard(BaseModel):
    type: Literal["move_card"] = "move_card"
    card_id: int = Field(alias="cardId")
    column_id: int = Field(alias="columnId")
    position: int = Field(ge=0)


class DeleteCard(BaseModel):
    type: Literal["delete_card"] = "delete_card"
    card_id: int = Field(alias="cardId")


BoardOperation = Annotated[
    RenameColumn | CreateCard | UpdateCard | MoveCard | DeleteCard,
    Field(discriminator="type"),
]
