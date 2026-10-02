import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

type AddColumnFormProps = {
  onAdd: (title: string) => void;
};

export const AddColumnForm = ({ onAdd }: AddColumnFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const close = () => {
    setIsOpen(false);
    setTitle("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onAdd(title.trim());
    close();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-11 min-w-[170px] items-center justify-center gap-1.5 self-start rounded-xl border border-dashed border-[var(--stroke-strong)] px-3 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
      >
        <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
        Add column
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="min-w-[170px] space-y-2 self-start rounded-xl border border-[var(--stroke)] bg-white p-2 shadow-[var(--shadow-sm)]"
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && close()}
        placeholder="Column title"
        aria-label="New column title"
        className="w-full rounded-md border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm font-semibold text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20"
        maxLength={120}
        required
        autoFocus
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
        >
          Add column
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
  );
};
