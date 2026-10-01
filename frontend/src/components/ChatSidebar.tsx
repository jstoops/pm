"use client";

import { FormEvent, useState } from "react";
import { redirectIfUnauthorized } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  assistantText: string;
  board?: BoardData;
};

type ChatSidebarProps = {
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ onBoardUpdate }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = message.trim();
    if (!question || isSending) {
      return;
    }

    setError("");
    setIsSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history: messages.slice(-12) }),
      });
      redirectIfUnauthorized(response);
      if (!response.ok) {
        throw new Error("Unable to send message.");
      }
      const result = (await response.json()) as ChatResponse;
      setMessages((previous) => [
        ...previous,
        { role: "user", content: question },
        { role: "assistant", content: result.assistantText },
      ]);
      setMessage("");
      if (result.board) {
        onBoardUpdate(result.board);
      }
    } catch {
      setError("Unable to reach the assistant. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside
      aria-label="Board assistant"
      className="flex min-h-[480px] flex-col border border-[var(--stroke)] bg-white p-5 shadow-[var(--shadow)] lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]"
      data-testid="ai-chat-sidebar"
    >
      <div className="border-b border-[var(--stroke)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--primary-blue)]">
          Board Assistant
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold text-[var(--navy-dark)]">
          Plan in context
        </h2>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--gray-text)]">
            Ask about priorities or request a board update.
          </p>
        ) : (
          messages.map((chatMessage, index) => (
            <div
              key={`${chatMessage.role}-${index}`}
              className={
                chatMessage.role === "user"
                  ? "border-l-2 border-[var(--primary-blue)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--navy-dark)]"
                  : "border-l-2 border-[var(--accent-yellow)] px-3 py-2 text-sm leading-6 text-[var(--navy-dark)]"
              }
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gray-text)]">
                {chatMessage.role === "user" ? "You" : "Assistant"}
              </p>
              <p>{chatMessage.content}</p>
            </div>
          ))
        )}
        {isSending && <p className="text-sm text-[var(--gray-text)]">Thinking...</p>}
      </div>

      <form className="border-t border-[var(--stroke)] pt-4" onSubmit={submit}>
        {error && (
          <p className="mb-3 text-sm font-semibold text-[var(--secondary-purple)]" role="alert">
            {error}
          </p>
        )}
        <label className="sr-only" htmlFor="assistant-message">
          Message the board assistant
        </label>
        <textarea
          id="assistant-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask about this board"
          rows={3}
          disabled={isSending}
          className="w-full resize-none border border-[var(--stroke)] bg-[var(--surface)] px-3 py-3 text-sm leading-5 text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] disabled:cursor-wait"
        />
        <button
          type="submit"
          disabled={isSending || !message.trim()}
          className="mt-3 w-full bg-[var(--secondary-purple)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--navy-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </aside>
  );
};