import clsx from "clsx";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { compactInputClass, FormActions } from "@/components/FormActions";

const initialFormState = { title: "", details: "" };

type NewCardFormProps = {
  onAdd: (title: string, details: string) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);

  const close = () => {
    setIsOpen(false);
    setFormState(initialFormState);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = formState.title.trim();
    if (!title) {
      return;
    }
    onAdd(title, formState.details.trim());
    close();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:bg-white hover:text-[var(--primary-blue)]"
      >
        <Plus aria-hidden="true" size={16} strokeWidth={2.25} />
        Add a card
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-lg border border-[var(--stroke)] bg-white p-2 shadow-[var(--shadow-sm)]"
    >
      <input
        value={formState.title}
        onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
        placeholder="Card title"
        className={clsx(compactInputClass, "font-semibold")}
        required
        autoFocus
      />
      <textarea
        value={formState.details}
        onChange={(event) => setFormState((prev) => ({ ...prev, details: event.target.value }))}
        placeholder="Details"
        rows={2}
        className={clsx(compactInputClass, "resize-none")}
      />
      <FormActions submitLabel="Add card" onCancel={close} />
    </form>
  );
};
