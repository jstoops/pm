import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import { compactInputClass, FormActions } from "@/components/FormActions";
import { CardText } from "@/components/KanbanCardPreview";
import { cardDragId, type Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onUpdate: (cardId: string, title: string, details: string) => void;
};

const iconButtonClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--gray-text)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]";

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

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextDetails = details.trim();
    if (!nextTitle) {
      return;
    }
    if (nextTitle !== card.title || nextDetails !== card.details) {
      onUpdate(card.id, nextTitle, nextDetails);
    }
    setIsEditing(false);
  };

  return (
    <article
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
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
            className={clsx(compactInputClass, "font-semibold")}
            required
            autoFocus
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Card details"
            rows={3}
            className={clsx(compactInputClass, "resize-none")}
          />
          <FormActions submitLabel="Save" onCancel={() => setIsEditing(false)} />
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardText card={card} />
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
