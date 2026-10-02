import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import { cardDragId, type Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, title: string, details: string) => void;
};

const iconButtonClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--gray-text)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]";

const inputClass =
  "w-full rounded-md border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20";

export const KanbanCard = ({ card, onDelete, onUpdate }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cardDragId(card.id), disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    if (title.trim() !== card.title || details.trim() !== card.details) {
      onUpdate(card.id, title.trim(), details.trim());
    }
    setIsEditing(false);
  };

  return (
    <article
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={style}
      className={clsx(
        "group rounded-lg border border-[var(--stroke)] bg-white px-3 py-2.5 shadow-[var(--shadow-sm)] outline-none",
        "transition-[border-color,box-shadow] duration-150 hover:border-[var(--stroke-strong)] focus-visible:ring-2 focus-visible:ring-[var(--primary-blue)]",
        !isEditing && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
      {...(isEditing ? {} : attributes)}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Card title"
            className={clsx(inputClass, "font-semibold")}
            required
            autoFocus
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Card details"
            rows={3}
            className={clsx(inputClass, "resize-none")}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-md bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="break-words text-sm font-semibold leading-5 text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {card.details && (
              <p className="mt-1 break-words text-[13px] leading-5 text-[var(--text-muted)]">
                {card.details}
              </p>
            )}
          </div>
          <div className="-mr-1 -mt-0.5 flex shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={startEditing}
              className={iconButtonClass}
              aria-label={`Edit ${card.title}`}
              title="Edit card"
            >
              <Pencil aria-hidden="true" size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className={iconButtonClass}
              aria-label={`Delete ${card.title}`}
              title="Delete card"
            >
              <Trash2 aria-hidden="true" size={15} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
