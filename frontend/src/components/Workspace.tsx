"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle, LogOut, RotateCw, SquareKanban, UserRound } from "lucide-react";
import { BoardSidebar } from "@/components/BoardSidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { apiRequest, jsonRequest } from "@/lib/api";
import { summarizeBoard, type BoardData, type BoardSummary } from "@/lib/kanban";

type Session = { authenticated: boolean; username?: string };

const SELECTED_BOARD_KEY = "pm:selected-board";

/** The last opened board is a per-browser convenience; the board data itself lives on the server. */
const storedBoardId = () => {
  try {
    return window.localStorage.getItem(SELECTED_BOARD_KEY);
  } catch {
    return null;
  }
};

const storeBoardId = (boardId: string) => {
  try {
    window.localStorage.setItem(SELECTED_BOARD_KEY, boardId);
  } catch {
    // Storage can be unavailable (private mode); selection just will not persist.
  }
};

const logout = async () => {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (response.ok) {
    window.location.assign("/");
  }
};

type WorkspaceProps = {
  onLogout?: () => void | Promise<void>;
};

export const Workspace = ({ onLogout = logout }: WorkspaceProps) => {
  const [username, setUsername] = useState("");
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([
      apiRequest<Session>("/api/auth/session"),
      apiRequest<BoardSummary[]>("/api/boards"),
    ])
      .then(([session, boardList]) => {
        if (!isCurrent) {
          return;
        }
        const stored = storedBoardId();
        setUsername(session.username ?? "");
        setBoards(boardList);
        setSelectedId(
          boardList.some((board) => board.id === stored) ? stored : (boardList[0]?.id ?? null)
        );
      })
      .catch(() => {
        if (isCurrent) {
          setError("Unable to load your boards.");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [loadAttempt]);

  const selectBoard = (boardId: string | null) => {
    setSelectedId(boardId);
    if (boardId) {
      storeBoardId(boardId);
    }
  };

  const createBoard = async (name: string) => {
    try {
      setError("");
      const board = await apiRequest<BoardData>("/api/boards", jsonRequest("POST", { name }));
      setBoards((current) => [
        ...(current ?? []),
        { ...summarizeBoard(board), updatedAt: new Date().toISOString() },
      ]);
      selectBoard(board.id);
    } catch {
      setError("Unable to create the board. Please try again.");
    }
  };

  const updateSummary = (board: BoardData) => {
    setBoards((current) =>
      (current ?? []).map((item) =>
        item.id === board.id ? { ...item, ...summarizeBoard(board) } : item
      )
    );
  };

  const removeSelectedBoard = () => {
    const remaining = (boards ?? []).filter((board) => board.id !== selectedId);
    setBoards(remaining);
    selectBoard(remaining[0]?.id ?? null);
  };

  const headerButtonClass =
    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="flex shrink-0 items-center gap-4 bg-[var(--navy-dark)] px-4 py-3 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-yellow)] text-[var(--navy-dark)]">
          <SquareKanban aria-hidden="true" size={20} strokeWidth={2.25} />
        </span>
        <h1 className="font-display text-lg font-semibold leading-6 text-white">Kanban Studio</h1>
        <div className="ml-auto flex items-center gap-1">
          <a href="/account" className={headerButtonClass} aria-label="Account settings">
            <UserRound aria-hidden="true" size={17} />
            <span className="hidden max-w-40 truncate sm:inline">{username || "Account"}</span>
          </a>
          <button
            type="button"
            onClick={() => void onLogout()}
            aria-label="Log out"
            className={headerButtonClass}
          >
            <LogOut aria-hidden="true" size={17} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {boards === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-sm font-medium text-[var(--text-muted)]">
          {error ? (
            <CircleAlert aria-hidden="true" size={28} className="text-[var(--secondary-purple)]" />
          ) : (
            <LoaderCircle aria-hidden="true" size={28} className="animate-spin text-[var(--primary-blue)]" />
          )}
          <p>{error || "Loading your boards..."}</p>
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
      ) : (
        <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
          <BoardSidebar
            boards={boards}
            selectedId={selectedId}
            onSelect={selectBoard}
            onCreate={createBoard}
          />
          <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
            {error && (
              <p
                className="flex shrink-0 items-center gap-2 border-b border-[var(--secondary-purple)]/20 bg-[var(--secondary-purple)]/10 px-6 py-2 text-sm font-medium text-[var(--secondary-purple)]"
                role="alert"
              >
                <CircleAlert aria-hidden="true" size={16} className="shrink-0" />
                {error}
              </p>
            )}
            {selectedId ? (
              <KanbanBoard
                key={selectedId}
                boardId={selectedId}
                onBoardChange={updateSummary}
                onBoardDeleted={removeSelectedBoard}
              />
            ) : (
              <div className="m-auto max-w-sm px-6 py-16 text-center">
                <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
                  No boards yet
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  Use New board to start planning a project.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
