import clsx from "clsx";
import { useState, type CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ArrowLeft,
  ArrowRight,
  CircleCheckBig,
  Compass,
  Ellipsis,
  Eye,
  Inbox,
  LoaderCircle,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cardDragId, columnDropId, type Card, type Column } from "@/lib/kanban";
import { InlineTitle } from "@/components/InlineTitle";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

/** Each column position keeps one stage style (cycling after five), even after a rename. */
const columnStyles: { icon: LucideIcon; color: string }[] = [
  { icon: Inbox, color: "var(--gray-text)" },
  { icon: Compass, color: "var(--primary-blue)" },
  { icon: LoaderCircle, color: "var(--accent-yellow)" },
  { icon: Eye, color: "var(--secondary-purple)" },
  { icon: CircleCheckBig, color: "var(--navy-dark)" },
];

type KanbanColumnProps = {
  column: Column;
  index: number;
  columnCount: number;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onMove: (columnId: string, position: number) => void;
  onDelete: (columnId: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (cardId: string) => void;
  onUpdateCard: (cardId: string, title: string, details: string) => void;
};

const menuItemClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--navy-dark)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40";

export const KanbanColumn = ({
  column,
  index,
  columnCount,
  cards,
  onRename,
  onMove,
  onDelete,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
}: KanbanColumnProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(column.id),
    data: { type: "column" },
  });
  const { icon: Icon, color } = columnStyles[index % columnStyles.length];
  const runMenuAction = (action: () => void) => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <section
      ref={setNodeRef}
      style={{ "--column-color": color } as CSSProperties}
      className={clsx(
        "flex min-h-[420px] min-w-0 flex-col rounded-xl border border-t-[3px] border-[var(--stroke)] border-t-[var(--column-color)] bg-[var(--surface-muted)] transition lg:min-h-0",
        isOver && "ring-2 ring-[var(--column-color)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <header className="flex items-center gap-1.5 px-2.5 pb-2 pt-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-[var(--column-color)] shadow-[var(--shadow-sm)]">
          <Icon aria-hidden="true" size={16} strokeWidth={2.25} />
        </span>
        <InlineTitle
          key={column.title}
          initialTitle={column.title}
          onRename={(title) => onRename(column.id, title)}
          label="Column title"
          className="flex-1 font-display text-sm"
        />
        <span
          className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-muted)] shadow-[var(--shadow-sm)]"
          aria-label={`${cards.length} cards`}
        >
          {cards.length}
        </span>
        <div
          className="relative shrink-0"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsMenuOpen(false);
            }
          }}
          onKeyDown={(event) => event.key === "Escape" && setIsMenuOpen(false)}
        >
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-label={`Actions for ${column.title}`}
            className="flex h-7 w-6 items-center justify-center rounded-md text-[var(--gray-text)] transition hover:bg-white hover:text-[var(--navy-dark)]"
          >
            <Ellipsis aria-hidden="true" size={16} />
          </button>
          {isMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-[var(--stroke)] bg-white p-1 shadow-[var(--shadow)]"
            >
              <button
                type="button"
                role="menuitem"
                disabled={index === 0}
                onClick={() => runMenuAction(() => onMove(column.id, index - 1))}
                className={menuItemClass}
              >
                <ArrowLeft aria-hidden="true" size={15} />
                Move left
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={index === columnCount - 1}
                onClick={() => runMenuAction(() => onMove(column.id, index + 1))}
                className={menuItemClass}
              >
                <ArrowRight aria-hidden="true" size={15} />
                Move right
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(() => onDelete(column.id))}
                className={clsx(menuItemClass, "text-[var(--secondary-purple)]")}
              >
                <Trash2 aria-hidden="true" size={15} />
                Delete column
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="thin-scrollbar flex flex-1 flex-col gap-2 px-2 pb-2 pt-1 lg:min-h-0 lg:overflow-y-auto">
        <SortableContext
          id={columnDropId(column.id)}
          items={column.cardIds.map(cardDragId)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={onDeleteCard}
              onUpdate={onUpdateCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-[var(--stroke-strong)] px-3 py-8 text-center text-xs font-medium text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <div className="px-2 pb-2">
        <NewCardForm onAdd={(title, details) => onAddCard(column.id, title, details)} />
      </div>
    </section>
  );
};
