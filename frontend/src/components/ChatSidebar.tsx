"use client";

import { FormEvent, useState } from "react";
import {
  CircleAlert,
  LoaderCircle,
  MessageSquareText,
  SendHorizontal,
  Sparkles,
} from "lucide-react";
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
  boardId: string;
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ boardId, onBoardUpdate }: ChatSidebarProps) => {
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
      const response = await fetch(`/api/boards/${boardId}/chat`, {
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
      className="flex h-full min-h-[480px] flex-col bg-white lg:min-h-0"
      data-testid="ai-chat-sidebar"
    >
      <div className="flex items-center gap-3 border-b border-[var(--stroke)] px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]">
          <Sparkles aria-hidden="true" size={18} strokeWidth={2} />
        </span>
        <div>
          <h2 className="font-display text-base font-semibold leading-5 text-[var(--navy-dark)]">
            Board Assistant
          </h2>
          <p className="text-xs text-[var(--text-muted)]">Plan and update cards in context</p>
        </div>
      </div>

      <div
        className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-5"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="m-auto max-w-[240px] text-center">
            <MessageSquareText
              aria-hidden="true"
              size={28}
              strokeWidth={1.5}
              className="mx-auto text-[var(--stroke-strong)]"
            />
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              Ask about priorities or request a board update.
            </p>
          </div>
        ) : (
          messages.map((chatMessage, index) => (
            <div
              key={`${chatMessage.role}-${index}`}
              className={
                chatMessage.role === "user"
                  ? "ml-8 self-end rounded-2xl rounded-br-sm bg-[var(--navy-dark)] px-3.5 py-2 text-sm leading-6 text-white"
                  : "mr-8 self-start rounded-2xl rounded-bl-sm bg-[var(--surface-muted)] px-3.5 py-2 text-sm leading-6 text-[var(--navy-dark)]"
              }
            >
              <p className="sr-only">{chatMessage.role === "user" ? "You" : "Assistant"}</p>
              <p className="whitespace-pre-wrap break-words">{chatMessage.content}</p>
            </div>
          ))
        )}
        {isSending && (
          <p className="flex items-center gap-2 self-start text-sm text-[var(--text-muted)]">
            <LoaderCircle aria-hidden="true" size={14} className="animate-spin" />
            Thinking...
          </p>
        )}
      </div>

      <form className="border-t border-[var(--stroke)] px-5 py-4" onSubmit={submit}>
        {error && (
          <p
            className="mb-3 flex items-start gap-2 text-sm font-medium text-[var(--secondary-purple)]"
            role="alert"
          >
            <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
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
          className="w-full resize-none rounded-lg border border-[var(--stroke-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm leading-5 text-[var(--navy-dark)] outline-none transition placeholder:text-[var(--gray-text)] focus:border-[var(--primary-blue)] focus:bg-white focus:ring-2 focus:ring-[var(--primary-blue)]/20 disabled:cursor-wait"
        />
        <button
          type="submit"
          disabled={isSending || !message.trim()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SendHorizontal aria-hidden="true" size={16} strokeWidth={2} />
          {isSending ? "Sending..." : "Send message"}
        </button>
      </form>
    </aside>
  );
};
