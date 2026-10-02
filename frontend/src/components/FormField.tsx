import type { InputHTMLAttributes } from "react";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
};

/** A labelled text input in the shared account-form style. */
export const FormField = ({ id, label, hint, ...inputProps }: FormFieldProps) => (
  <div>
    <label className="text-sm font-semibold text-[var(--navy-dark)]" htmlFor={id}>
      {label}
    </label>
    <input
      id={id}
      aria-describedby={hint ? `${id}-hint` : undefined}
      className="mt-1.5 w-full rounded-lg border border-[var(--stroke-strong)] bg-white px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20"
      required
      {...inputProps}
    />
    {hint && (
      <p id={`${id}-hint`} className="mt-1 text-xs text-[var(--text-muted)]">
        {hint}
      </p>
    )}
  </div>
);

export const submitButtonClass =
  "w-full rounded-lg bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70";
