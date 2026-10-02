import clsx from "clsx";
import { useState, type FormEvent } from "react";
import { FolderKanban, Plus } from "lucide-react";
import type { BoardSummary } from "@/lib/kanban";

type BoardSidebarProps = {
  boards: BoardSummary[];
  selectedId: string | null;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => Promise<void>;
};

export const BoardSidebar = ({ boards, selectedId, onSelect, onCreate }: BoardSidebarProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const close = () => {
    setIsCreating(false);
    setName("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onCreate(name.trim());
      close();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <nav
      aria-label="Boards"
      className="shrink-0 border-b border-[var(--stroke)] bg-white lg:flex lg:w-60 lg:flex-col lg:border-b-0 lg:border-r"
    >
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--gray-text)]">
          Boards
        </h2>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface-muted)]"
        >
          <Plus aria-hidden="true" size={14} strokeWidth={2.5} />
          New board
        </button>
      </div>
      {isCreating && (
        <form onSubmit={handleSubmit} className="space-y-2 px-3 py-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && close()}
            placeholder="Board name"
            aria-label="New board name"
            maxLength={120}
            className="w-full rounded-md border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20"
            required
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              Create board
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <ul className="thin-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 pt-1 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
        {boards.map((board) => {
          const isSelected = board.id === selectedId;
          return (
            <li key={board.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(board.id)}
                aria-current={isSelected ? "page" : undefined}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
                  isSelected
                    ? "bg-[var(--navy-dark)] text-white"
                    : "text-[var(--navy-dark)] hover:bg-[var(--surface-muted)]"
                )}
              >
                <FolderKanban
                  aria-hidden="true"
                  size={16}
                  className={isSelected ? "text-[var(--accent-yellow)]" : "text-[var(--gray-text)]"}
                />
                <span className="min-w-0 flex-1 truncate font-medium lg:max-w-none">{board.name}</span>
                <span
                  className={clsx(
                    "text-xs tabular-nums",
                    isSelected ? "text-white/60" : "text-[var(--gray-text)]"
                  )}
                  aria-label={`${board.cardCount} cards`}
                >
                  {board.cardCount}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
