import clsx from "clsx";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { compactInputClass, FormActions } from "@/components/FormActions";

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
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    onAdd(nextTitle);
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
        className={clsx(compactInputClass, "font-semibold")}
        maxLength={120}
        required
        autoFocus
      />
      <FormActions submitLabel="Add column" onCancel={close} />
    </form>
  );
};
