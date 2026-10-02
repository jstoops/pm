import clsx from "clsx";
import { useState, type CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  CircleCheckBig,
  Compass,
  Eye,
  Inbox,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { cardDragId, columnDropId, type Card, type Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

/** The board has five fixed columns, so each position keeps one stage style even after a rename. */
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
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (cardId: string) => void;
  onUpdateCard: (cardId: string, title: string, details: string) => void;
};

type ColumnTitleProps = {
  columnId: string;
  initialTitle: string;
  onRename: (columnId: string, title: string) => void;
};

const ColumnTitle = ({ columnId, initialTitle, onRename }: ColumnTitleProps) => {
  const [title, setTitle] = useState(initialTitle);

  return (
    <input
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        const nextTitle = title.trim();
        if (!nextTitle || nextTitle === initialTitle) {
          setTitle(initialTitle);
          return;
        }
        onRename(columnId, nextTitle);
      }}
      className="min-w-0 flex-1 text-ellipsis rounded-md border border-transparent bg-transparent px-1 py-0.5 font-display text-sm font-semibold text-[var(--navy-dark)] outline-none transition hover:border-[var(--stroke)] focus:border-[var(--primary-blue)] focus:bg-white"
      aria-label="Column title"
    />
  );
};

export const KanbanColumn = ({
  column,
  index,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDropId(column.id),
    data: { type: "column" },
  });
  const { icon: Icon, color } = columnStyles[index % columnStyles.length];

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
        <ColumnTitle
          key={column.title}
          columnId={column.id}
          initialTitle={column.title}
          onRename={onRename}
        />
        <span
          className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-muted)] shadow-[var(--shadow-sm)]"
          aria-label={`${cards.length} cards`}
        >
          {cards.length}
        </span>
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
