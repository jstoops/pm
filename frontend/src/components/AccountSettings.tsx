"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ArrowLeft, SquareKanban, UserRound } from "lucide-react";
import { FormField, submitButtonClass } from "@/components/FormField";
import { ApiError, apiRequest, jsonRequest } from "@/lib/api";

type Account = { username: string; createdAt: string; boardCount: number };

type AccountSettingsProps = {
  onAccountDeleted?: () => void;
};

const goToLogin = () => {
  window.location.assign("/login");
};

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow-sm)]">
    <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">{title}</h2>
    {children}
  </section>
);

const Message = ({ tone, children }: { tone: "error" | "success"; children: ReactNode }) => (
  <p
    role={tone === "error" ? "alert" : "status"}
    className={
      tone === "error"
        ? "text-sm font-medium text-[var(--secondary-purple)]"
        : "text-sm font-medium text-[var(--primary-blue)]"
    }
  >
    {children}
  </p>
);

const PasswordForm = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (next !== confirmation) {
      setResult({ tone: "error", text: "New passwords do not match." });
      return;
    }
    setResult(null);
    setIsSubmitting(true);
    try {
      await apiRequest(
        "/api/account/password",
        jsonRequest("POST", { current_password: current, new_password: next })
      );
      setCurrent("");
      setNext("");
      setConfirmation("");
      setResult({ tone: "success", text: "Password updated." });
    } catch (error) {
      setResult({
        tone: "error",
        text:
          error instanceof ApiError && error.status === 403
            ? "Current password is incorrect."
            : "Unable to update the password. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
      <FormField
        id="current-password"
        label="Current password"
        type="password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        autoComplete="current-password"
      />
      <FormField
        id="new-password"
        label="New password"
        hint="At least 8 characters."
        type="password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
        autoComplete="new-password"
        minLength={8}
      />
      <FormField
        id="new-password-confirmation"
        label="Confirm new password"
        type="password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="new-password"
        minLength={8}
      />
      {result && <Message tone={result.tone}>{result.text}</Message>}
      <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
        {isSubmitting ? "Updating..." : "Update password"}
      </button>
    </form>
  );
};

const DeleteAccountForm = ({ onDeleted }: { onDeleted: () => void }) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.confirm("Delete your account and every board? This cannot be undone.")) {
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await apiRequest("/api/account/delete", jsonRequest("POST", { password }));
      onDeleted();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError && requestError.status === 403
          ? "Password is incorrect."
          : "Unable to delete the account. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
      <FormField
        id="delete-password"
        label="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
      />
      {error && <Message tone="error">{error}</Message>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg border border-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-[var(--secondary-purple)] transition hover:bg-[var(--secondary-purple)] hover:text-white disabled:opacity-60"
      >
        Delete account
      </button>
    </form>
  );
};

export const AccountSettings = ({ onAccountDeleted = goToLogin }: AccountSettingsProps) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<Account>("/api/account")
      .then(setAccount)
      .catch(() => setError("Unable to load your account."));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 bg-[var(--navy-dark)] px-4 py-3 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-yellow)] text-[var(--navy-dark)]">
          <SquareKanban aria-hidden="true" size={20} strokeWidth={2.25} />
        </span>
        <span className="font-display text-lg font-semibold text-white">Kanban Studio</span>
        <a
          href="/"
          className="ml-auto flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft aria-hidden="true" size={17} />
          Back to boards
        </a>
      </header>
      <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
        <h1 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Account settings
        </h1>
        {error && <Message tone="error">{error}</Message>}
        {account && (
          <section className="flex items-center gap-4 rounded-xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow-sm)]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]">
              <UserRound aria-hidden="true" size={24} />
            </span>
            <div>
              <p className="font-display text-lg font-semibold text-[var(--navy-dark)]" data-testid="account-username">
                {account.username}
              </p>
              <p className="text-sm text-[var(--text-muted)]">
                {account.boardCount} {account.boardCount === 1 ? "board" : "boards"} - member since{" "}
                {new Date(`${account.createdAt.replace(" ", "T")}Z`).toLocaleDateString()}
              </p>
            </div>
          </section>
        )}
        <Panel title="Change password">
          <PasswordForm />
        </Panel>
        <Panel title="Delete account">
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Permanently removes your account and all of your boards.
          </p>
          <DeleteAccountForm onDeleted={onAccountDeleted} />
        </Panel>
      </main>
    </div>
  );
};
