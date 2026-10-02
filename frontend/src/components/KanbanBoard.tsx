"use client";

import { useEffect, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import clsx from "clsx";
import {
  CircleAlert,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Trash2,
} from "lucide-react";
import { AddColumnForm } from "@/components/AddColumnForm";
import { ChatSidebar } from "@/components/ChatSidebar";
import { InlineTitle } from "@/components/InlineTitle";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { apiRequest, jsonRequest } from "@/lib/api";
import { moveCard, parseDragId, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: string;
  /** Called with every board the server returns after a change, so the workspace can refresh its list. */
  onBoardChange?: (board: BoardData) => void;
  onBoardDeleted?: () => void;
};

/**
 * Resolves the drop target from the pointer alone: the card the pointer sits
 * above, otherwise the hovered column. The dragged card's own rectangle is
 * ignored because it trails the pointer and would bias the vertical midpoints.
 * Keyboard drags have no pointer and use the closest droppable instead.
 */
const collisionDetection: CollisionDetection = (args) => {
  const { droppableContainers, droppableRects, pointerCoordinates } = args;
  if (!pointerCoordinates) {
    return closestCorners(args);
  }

  const { x, y } = pointerCoordinates;
  const column = droppableContainers.find((container) => {
    const rect = droppableRects.get(container.id);
    return (
      container.data.current?.type === "column" &&
      rect !== undefined &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  });

  if (!column) {
    return [];
  }

  const cardBelowPointer = droppableContainers
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return container.data.current?.sortable?.containerId === column.id && rect
        ? [{ id: container.id, rect }]
        : [];
    })
    .sort((first, second) => first.rect.top - second.rect.top)
    .find(({ rect }) => y < rect.top + rect.height / 2);

  return [{ id: cardBelowPointer?.id ?? column.id }];
};

export const KanbanBoard = ({ boardId, onBoardChange, onBoardDeleted }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const boardChangeId = useRef(0);
  const boardChangeQueue = useRef(Promise.resolve());
  const boardUrl = `/api/boards/${boardId}`;

  useEffect(() => {
    let isCurrent = true;

    void apiRequest<BoardData>(`/api/boards/${boardId}`)
      .then((nextBoard) => {
        if (isCurrent) {
          setBoard(nextBoard);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setError("Unable to load the board.");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [boardId, loadAttempt]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const showServerBoard = (nextBoard: BoardData) => {
    setBoard(nextBoard);
    onBoardChange?.(nextBoard);
  };

  const applyBoardChange = async (
    path: string,
    init: RequestInit,
    optimisticBoard?: BoardData
  ) => {
    const previousBoard = board;
    const changeId = ++boardChangeId.current;
    const request = boardChangeQueue.current.then(() =>
      apiRequest<BoardData>(`${boardUrl}${path}`, init)
    );
    boardChangeQueue.current = request.then(
      () => undefined,
      () => undefined
    );

    try {
      setError("");
      if (optimisticBoard) {
        setBoard(optimisticBoard);
      }
      const nextBoard = await request;
      if (changeId === boardChangeId.current) {
        showServerBoard(nextBoard);
      }
    } catch {
      if (changeId !== boardChangeId.current) {
        return;
      }
      if (optimisticBoard && previousBoard) {
        setBoard(previousBoard);
      }
      setError("Unable to save that change. Your board is unchanged.");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(parseDragId(event.active.id as string).id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const cardId = parseDragId(active.id as string).id;
    const target = parseDragId(over.id as string);
    // Keyboard drags take the target card's slot, so moving down a column
    // lands behind the target. Pointer drags always land in front of it.
    const sourceCardIds =
      board.columns.find((column) => column.cardIds.includes(cardId))?.cardIds ?? [];
    const afterTarget =
      event.activatorEvent instanceof KeyboardEvent &&
      target.type === "card" &&
      sourceCardIds.indexOf(target.id) > sourceCardIds.indexOf(cardId);
    const columns = moveCard(board.columns, cardId, target, afterTarget);
    const destination = columns.find((column) => column.cardIds.includes(cardId));
    if (!destination) {
      return;
    }

    void applyBoardChange(
      `/cards/${cardId}/move`,
      jsonRequest("POST", {
        column_id: Number(destination.id),
        position: destination.cardIds.indexOf(cardId),
      }),
      { ...board, columns }
    );
  };

  const handleRenameBoard = (name: string) => {
    void applyBoardChange("", jsonRequest("PATCH", { name }));
  };

  const handleDeleteBoard = async () => {
    if (!board || !window.confirm(`Delete "${board.name}" and all of its cards?`)) {
      return;
    }
    try {
      await apiRequest<void>(boardUrl, { method: "DELETE" });
      onBoardDeleted?.();
    } catch {
      setError("Unable to delete the board. Please try again.");
    }
  };

  const handleAddColumn = (title: string) => {
    void applyBoardChange("/columns", jsonRequest("POST", { title }));
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    void applyBoardChange(`/columns/${columnId}`, jsonRequest("PATCH", { title }));
  };

  const handleMoveColumn = (columnId: string, position: number) => {
    void applyBoardChange(`/columns/${columnId}/move`, jsonRequest("POST", { position }));
  };

  const handleDeleteColumn = (columnId: string) => {
    const column = board?.columns.find((item) => item.id === columnId);
    if (
      column &&
      column.cardIds.length > 0 &&
      !window.confirm(`Delete "${column.title}" and its ${column.cardIds.length} cards?`)
    ) {
      return;
    }
    void applyBoardChange(`/columns/${columnId}`, { method: "DELETE" });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    void applyBoardChange(
      "/cards",
      jsonRequest("POST", { column_id: Number(columnId), title, details })
    );
  };

  const handleUpdateCard = (cardId: string, title: string, details: string) => {
    void applyBoardChange(`/cards/${cardId}`, jsonRequest("PATCH", { title, details }));
  };

  const handleDeleteCard = (cardId: string) => {
    void applyBoardChange(`/cards/${cardId}`, { method: "DELETE" });
  };

  const activeCard = activeCardId ? board?.cards[activeCardId] : null;

  if (!board) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-sm font-medium text-[var(--text-muted)]">
        {error ? (
          <CircleAlert aria-hidden="true" size={28} className="text-[var(--secondary-purple)]" />
        ) : (
          <LoaderCircle aria-hidden="true" size={28} className="animate-spin text-[var(--primary-blue)]" />
        )}
        <p>{error || "Loading board..."}</p>
        {error && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="flex items-center gap-2 rounded-lg border border-[var(--stroke-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-[var(--shadow-sm)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
          >
            <RotateCw aria-hidden="true" size={15} />
            Retry
          </button>
        )}
      </div>
    );
  }

  const cardCount = Object.keys(board.cards).length;
  const toolbarButtonClass =
    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]";

  return (
    <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--stroke)] bg-white px-4 py-2 sm:px-6">
        <div className="min-w-0 flex-1">
          <InlineTitle
            key={board.name}
            initialTitle={board.name}
            onRename={handleRenameBoard}
            label="Board name"
            className="w-full max-w-md font-display text-lg"
          />
          <p className="px-1 text-xs text-[var(--text-muted)]">
            {cardCount} {cardCount === 1 ? "card" : "cards"} across {board.columns.length}{" "}
            {board.columns.length === 1 ? "column" : "columns"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsAssistantOpen((open) => !open)}
            aria-pressed={isAssistantOpen}
            aria-label="Toggle assistant"
            className={toolbarButtonClass}
          >
            {isAssistantOpen ? (
              <PanelRightClose aria-hidden="true" size={17} />
            ) : (
              <PanelRightOpen aria-hidden="true" size={17} />
            )}
            <span className="hidden sm:inline">Assistant</span>
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteBoard()}
            aria-label="Delete board"
            className={clsx(toolbarButtonClass, "hover:text-[var(--secondary-purple)]")}
          >
            <Trash2 aria-hidden="true" size={16} />
            <span className="hidden sm:inline">Delete board</span>
          </button>
        </div>
      </div>

      {error && (
        <p
          className="flex shrink-0 items-center gap-2 border-b border-[var(--secondary-purple)]/20 bg-[var(--secondary-purple)]/10 px-6 py-2 text-sm font-medium text-[var(--secondary-purple)]"
          role="alert"
        >
          <CircleAlert aria-hidden="true" size={16} className="shrink-0" />
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <main className="thin-scrollbar min-w-0 flex-1 overflow-x-auto p-4 lg:min-h-0 2xl:p-6">
            <div className="grid h-full auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 lg:auto-cols-[minmax(170px,1fr)] 2xl:gap-4">
              {board.columns.map((column, index) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  index={index}
                  columnCount={board.columns.length}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onMove={handleMoveColumn}
                  onDelete={handleDeleteColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onUpdateCard={handleUpdateCard}
                />
              ))}
              <AddColumnForm onAdd={handleAddColumn} />
            </div>
          </main>
          <div
            className={clsx(
              "shrink-0 border-t border-[var(--stroke)] lg:w-[320px] lg:border-l 2xl:w-[380px] lg:border-t-0",
              !isAssistantOpen && "hidden"
            )}
          >
            <ChatSidebar
              boardId={boardId}
              onBoardUpdate={(nextBoard) => {
                setError("");
                showServerBoard(nextBoard);
              }}
            />
          </div>
        </div>
        <DragOverlay>
          {activeCard ? <KanbanCardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
