/** The text input style of the compact inline forms on the board and sidebar. */
export const compactInputClass =
  "w-full rounded-md border border-[var(--stroke-strong)] bg-white px-2.5 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20";

type FormActionsProps = {
  submitLabel: string;
  onCancel: () => void;
  isSubmitting?: boolean;
};

/** The submit and cancel buttons of a compact inline form. */
export const FormActions = ({ submitLabel, onCancel, isSubmitting }: FormActionsProps) => (
  <div className="flex items-center gap-2">
    <button
      type="submit"
      disabled={isSubmitting}
      className="rounded-md bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
    >
      {submitLabel}
    </button>
    <button
      type="button"
      onClick={onCancel}
      className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--navy-dark)]"
    >
      Cancel
    </button>
  </div>
);
