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
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  SquareKanban,
} from "lucide-react";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { redirectIfUnauthorized } from "@/lib/api";
import { moveCard, parseDragId, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onLogout?: () => void | Promise<void>;
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

const boardRequest = async (url: string, init?: RequestInit): Promise<BoardData> => {
  const response = await fetch(url, init);
  redirectIfUnauthorized(response);
  if (!response.ok) {
    throw new Error("Unable to save board changes.");
  }
  return response.json() as Promise<BoardData>;
};

const logout = async () => {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (response.ok) {
    window.location.assign("/");
  }
};

export const KanbanBoard = ({ onLogout = logout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const boardChangeId = useRef(0);
  const boardChangeQueue = useRef(Promise.resolve());

  useEffect(() => {
    let isCurrent = true;

    void boardRequest("/api/board")
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
  }, [loadAttempt]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const applyBoardChange = async (
    url: string,
    init: RequestInit,
    optimisticBoard?: BoardData
  ) => {
    const previousBoard = board;
    const changeId = ++boardChangeId.current;
    const request = boardChangeQueue.current.then(() => boardRequest(url, init));
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
        setBoard(nextBoard);
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

    void applyBoardChange(`/api/board/cards/${cardId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        column_id: Number(destination.id),
        position: destination.cardIds.indexOf(cardId),
      }),
    }, { ...board, columns });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    void applyBoardChange(`/api/board/columns/${columnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    void applyBoardChange("/api/board/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ column_id: Number(columnId), title, details }),
    });
  };

  const handleUpdateCard = (cardId: string, title: string, details: string) => {
    void applyBoardChange(`/api/board/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, details }),
    });
  };

  const handleDeleteCard = (cardId: string) => {
    void applyBoardChange(`/api/board/cards/${cardId}`, { method: "DELETE" });
  };

  const activeCard = activeCardId ? board?.cards[activeCardId] : null;

  if (!board) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-sm font-medium text-[var(--text-muted)]">
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
      </main>
    );
  }

  const cardCount = Object.keys(board.cards).length;
  const headerButtonClass =
    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex shrink-0 items-center gap-4 bg-[var(--navy-dark)] px-4 py-3 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-yellow)] text-[var(--navy-dark)]">
          <SquareKanban aria-hidden="true" size={20} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-lg font-semibold leading-6 text-white">
            Kanban Studio
          </h1>
          <p className="truncate text-xs text-white/60">
            {cardCount} {cardCount === 1 ? "card" : "cards"} across {board.columns.length} columns
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsAssistantOpen((open) => !open)}
            aria-pressed={isAssistantOpen}
            aria-label="Toggle assistant"
            className={headerButtonClass}
          >
            {isAssistantOpen ? (
              <PanelRightClose aria-hidden="true" size={17} />
            ) : (
              <PanelRightOpen aria-hidden="true" size={17} />
            )}
            <span className="hidden sm:inline">Assistant</span>
          </button>
          <button type="button" onClick={() => void onLogout()} className={headerButtonClass}>
            <LogOut aria-hidden="true" size={17} />
            Log out
          </button>
        </div>
      </header>

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
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onUpdateCard={handleUpdateCard}
                />
              ))}
            </div>
          </main>
          <div
            className={clsx(
              "shrink-0 border-t border-[var(--stroke)] lg:w-[320px] lg:border-l 2xl:w-[380px] lg:border-t-0",
              !isAssistantOpen && "hidden"
            )}
          >
            <ChatSidebar
              onBoardUpdate={(nextBoard) => {
                setError("");
                setBoard(nextBoard);
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
