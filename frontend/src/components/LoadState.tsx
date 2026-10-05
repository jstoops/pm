import { CircleAlert, LoaderCircle, RotateCw } from "lucide-react";

type LoadStateProps = {
  error: string;
  loadingText: string;
  onRetry: () => void;
};

/** Fills the view while data loads, or shows the load error with a retry button. */
export const LoadState = ({ error, loadingText, onRetry }: LoadStateProps) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-sm font-medium text-[var(--text-muted)]">
    {error ? (
      <CircleAlert aria-hidden="true" size={28} className="text-[var(--secondary-purple)]" />
    ) : (
      <LoaderCircle aria-hidden="true" size={28} className="animate-spin text-[var(--primary-blue)]" />
    )}
    <p>{error || loadingText}</p>
    {error && (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 rounded-lg border border-[var(--stroke-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] shadow-[var(--shadow-sm)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
      >
        <RotateCw aria-hidden="true" size={15} />
        Retry
      </button>
    )}
  </div>
);

/** A full-width alert strip for an error that leaves the current view usable. */
export const ErrorBanner = ({ message }: { message: string }) => (
  <p
    className="flex shrink-0 items-center gap-2 border-b border-[var(--secondary-purple)]/20 bg-[var(--secondary-purple)]/10 px-6 py-2 text-sm font-medium text-[var(--secondary-purple)]"
    role="alert"
  >
    <CircleAlert aria-hidden="true" size={16} className="shrink-0" />
    {message}
  </p>
);
