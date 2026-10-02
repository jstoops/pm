"use client";

import { type FormEvent, useState } from "react";

type LoginFormProps = {
  onAuthenticated?: () => void | Promise<void>;
};

const redirectToBoard = () => {
  window.location.assign("/");
};

export const LoginForm = ({
  onAuthenticated = redirectToBoard,
}: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        setError("Sign in failed. Check your username and password.");
        return;
      }

      await onAuthenticated();
    } catch {
      setError("Sign in is unavailable. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
      <div>
        <label
          className="text-sm font-semibold text-[var(--navy-dark)]"
          htmlFor="username"
        >
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-[var(--stroke-strong)] bg-white px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20"
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label
          className="text-sm font-semibold text-[var(--navy-dark)]"
          htmlFor="password"
        >
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-[var(--stroke-strong)] bg-white px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p className="text-sm font-medium text-[var(--secondary-purple)]" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 w-full rounded-lg bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};