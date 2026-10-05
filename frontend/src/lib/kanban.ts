export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  id: string;
  name: string;
  description: string;
  columns: Column[];
  cards: Record<string, Card>;
};

export type BoardSummary = {
  id: string;
  name: string;
  description: string;
  cardCount: number;
  updatedAt: string;
};

export const summarizeBoard = (board: BoardData): Omit<BoardSummary, "updatedAt"> => ({
  id: board.id,
  name: board.name,
  description: board.description,
  cardCount: Object.keys(board.cards).length,
});

// Card and column database ids share one numeric namespace, so drag and drop
// identifiers are prefixed to keep the two kinds of target apart.
export type DropTarget = { type: "card" | "column"; id: string };

export const cardDragId = (cardId: string) => `card:${cardId}`;

export const columnDropId = (columnId: string) => `column:${columnId}`;

export const parseDragId = (dragId: string): DropTarget => {
  const separator = dragId.indexOf(":");
  return {
    type: dragId.slice(0, separator) as DropTarget["type"],
    id: dragId.slice(separator + 1),
  };
};

/**
 * Moves a card in front of the target card (or behind it when `afterTarget` is
 * set), or to the end of the target column.
 */
export const moveCard = (
  columns: Column[],
  cardId: string,
  target: DropTarget,
  afterTarget = false
): Column[] => {
  const source = columns.find((column) => column.cardIds.includes(cardId));
  const destination =
    target.type === "column"
      ? columns.find((column) => column.id === target.id)
      : columns.find((column) => column.cardIds.includes(target.id));

  if (!source || !destination) {
    return columns;
  }

  const remaining = source.cardIds.filter((id) => id !== cardId);
  const isSameColumn = source.id === destination.id;
  const nextCardIds = isSameColumn ? [...remaining] : [...destination.cardIds];
  const targetIndex =
    target.type === "card" ? nextCardIds.indexOf(target.id) : -1;
  nextCardIds.splice(
    targetIndex === -1 ? nextCardIds.length : targetIndex + Number(afterTarget),
    0,
    cardId
  );

  return columns.map((column) => {
    if (column.id === destination.id) {
      return { ...column, cardIds: nextCardIds };
    }
    if (column.id === source.id) {
      return { ...column, cardIds: remaining };
    }
    return column;
  });
};
