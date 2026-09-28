"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onLogout?: () => void | Promise<void>;
};

const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const columnCollision = pointerCollisions.find(
    ({ id }) =>
      args.droppableContainers.find((container) => container.id === id)?.data
        .current?.type === "column"
  );

  if (columnCollision && args.pointerCoordinates) {
    const collisionCenterX =
      args.collisionRect.left + args.collisionRect.width / 2;
    const collisionCenterY =
      args.collisionRect.top + args.collisionRect.height / 2;
    const cardTarget = args.droppableContainers
      .filter((container) => container.id !== columnCollision.id)
      .map((container) => {
        const rect = args.droppableRects.get(container.id);
        return rect ? { container, rect } : null;
      })
      .filter(
        (target): target is NonNullable<typeof target> =>
          target !== null &&
          collisionCenterX >= target.rect.left &&
          collisionCenterX <= target.rect.right
      )
      .sort((first, second) => first.rect.top - second.rect.top)
      .find(
        ({ rect }) => collisionCenterY < rect.top + rect.height / 2
      );

    if (cardTarget) {
      return [{ id: cardTarget.container.id }];
    }

    return [columnCollision];
  }

  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

const boardRequest = async (url: string, init?: RequestInit): Promise<BoardData> => {
  const response = await fetch(url, init);
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
  const boardChangeId = useRef(0);
  const boardChangeQueue = useRef(Promise.resolve());
  const dropPoint = useRef<{ x: number; y: number } | null>(null);

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
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);

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
    setActiveCardId(event.active.id as string);
  };

  const handlePointerPosition = (event: React.PointerEvent<HTMLDivElement>) => {
    dropPoint.current = { x: event.clientX, y: event.clientY };
  };

  const dropTargetId = (fallbackId: string) => {
    if (!dropPoint.current) {
      return fallbackId;
    }

    const element = document.elementFromPoint(dropPoint.current.x, dropPoint.current.y);
    const card = element?.closest<HTMLElement>('[data-testid^="card-"]');
    if (card) {
      return card.dataset.testid?.replace("card-", "") ?? fallbackId;
    }

    const column = element?.closest<HTMLElement>('[data-testid^="column-"]');
    return column?.dataset.testid?.replace("column-", "") ?? fallbackId;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const overId = dropTargetId(over.id as string);
    dropPoint.current = null;
    if (active.id === overId) {
      return;
    }

    const columns = moveCard(board.columns, active.id as string, overId);
    const destination = columns.find((column) =>
      column.cardIds.includes(active.id as string)
    );
    if (!destination) {
      return;
    }

    void applyBoardChange(`/api/board/cards/${active.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        column_id: Number(destination.id),
        position: destination.cardIds.indexOf(active.id as string),
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

  const handleDeleteCard = (_columnId: string, cardId: string) => {
    void applyBoardChange(`/api/board/cards/${cardId}`, { method: "DELETE" });
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (!board) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-sm font-semibold text-[var(--gray-text)]">
        <p>{error || "Loading board..."}</p>
        {error && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
          >
            Retry
          </button>
        )}
      </main>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        {error && (
          <p className="text-sm font-semibold text-[var(--secondary-purple)]" role="alert">
            {error}
          </p>
        )}
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onLogout()}
                className="border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
              >
                Log out
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <div onPointerMove={handlePointerPosition} onPointerUp={handlePointerPosition}>
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <section className="grid gap-6 lg:grid-cols-5">
              {board.columns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId])}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
            </section>
            <DragOverlay>
              {activeCard ? (
                <div className="w-[260px]">
                  <KanbanCardPreview card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </main>
    </div>
  );
};
