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
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
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
          className="mt-2 w-full border border-[var(--stroke)] bg-white px-4 py-3 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
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
          className="mt-2 w-full border border-[var(--stroke)] bg-white px-4 py-3 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
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
        className="w-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--navy-dark)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};