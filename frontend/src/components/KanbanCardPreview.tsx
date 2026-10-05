import type { Card } from "@/lib/kanban";

/** A card's title and optional details, shared by the card and its drag preview. */
export const CardText = ({ card }: { card: Card }) => (
  <>
    <h4 className="break-words text-sm font-semibold leading-5 text-[var(--navy-dark)]">
      {card.title}
    </h4>
    {card.details && (
      <p className="mt-1 break-words text-[13px] leading-5 text-[var(--text-muted)]">
        {card.details}
      </p>
    )}
  </>
);

export const KanbanCardPreview = ({ card }: { card: Card }) => (
  <article className="h-full cursor-grabbing rounded-lg border border-[var(--primary-blue)] bg-white px-3 py-2.5 shadow-[var(--shadow)]">
    <CardText card={card} />
  </article>
);
