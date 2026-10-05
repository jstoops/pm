"use client";

import { type FormEvent, useState } from "react";
import { FormField, submitButtonClass } from "@/components/FormField";
import { jsonRequest } from "@/lib/api";

type LoginFormProps = {
  onAuthenticated?: () => void | Promise<void>;
};

const redirectToBoard = () => {
  window.location.assign("/");
};

export const LoginForm = ({ onAuthenticated = redirectToBoard }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      // Not apiRequest: a 401 here means wrong credentials, not an expired session.
      const response = await fetch("/api/auth/login", jsonRequest("POST", { username, password }));
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
      <FormField
        id="username"
        label="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
      />
      {error && (
        <p className="text-sm font-medium text-[var(--secondary-purple)]" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={isSubmitting} className={`mt-6 ${submitButtonClass}`}>
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
};
