"use client";

import { type FormEvent, useState } from "react";
import { FormField, submitButtonClass } from "@/components/FormField";
import { ApiError, apiRequest, jsonRequest } from "@/lib/api";

type RegisterFormProps = {
  onRegistered?: () => void | Promise<void>;
};

const redirectToBoard = () => {
  window.location.assign("/");
};

export const RegisterForm = ({ onRegistered = redirectToBoard }: RegisterFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await apiRequest("/api/auth/register", jsonRequest("POST", { username, password }));
      await onRegistered();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError && requestError.status === 409
          ? "That username is taken. Try another."
          : "Unable to create the account. Check the details and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
      <FormField
        id="username"
        label="Username"
        hint="3 to 32 letters, numbers, dots, dashes or underscores."
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        minLength={3}
        maxLength={32}
        pattern="[A-Za-z0-9_.\-]+"
      />
      <FormField
        id="password"
        label="Password"
        hint="At least 8 characters."
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        minLength={8}
      />
      <FormField
        id="password-confirmation"
        label="Confirm password"
        type="password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="new-password"
        minLength={8}
      />
      {error && (
        <p className="text-sm font-medium text-[var(--secondary-purple)]" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={isSubmitting} className={`mt-6 ${submitButtonClass}`}>
        {isSubmitting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
};
