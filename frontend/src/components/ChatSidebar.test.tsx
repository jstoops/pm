import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import type { BoardData } from "@/lib/kanban";

const updatedBoard: BoardData = {
  id: "7",
  name: "Board",
  description: "",
  columns: [{ id: "1", title: "Ideas", cardIds: [] }],
  cards: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatSidebar", () => {
  it("submits a message and applies an AI board update", async () => {
    const user = userEvent.setup();
    const onBoardUpdate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ assistantText: "I updated the board.", board: updatedBoard }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatSidebar boardId="7" onBoardUpdate={onBoardUpdate} />);

    await user.type(screen.getByLabelText("Message the board assistant"), "Rename Backlog");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("I updated the board.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/7/chat",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      message: "Rename Backlog",
      history: [],
    });
    expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard);
  });

  it("keeps the message available and shows an error when submission fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    render(<ChatSidebar boardId="7" onBoardUpdate={vi.fn()} />);

    const input = screen.getByLabelText("Message the board assistant");
    await user.type(input, "Help me prioritize");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to reach/i);
    expect(input).toHaveValue("Help me prioritize");
  });

  it("shows a pending state while the assistant is responding", async () => {
    const user = userEvent.setup();
    let completeRequest!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            completeRequest = resolve;
          })
      )
    );
    render(<ChatSidebar boardId="7" onBoardUpdate={vi.fn()} />);

    await user.type(screen.getByLabelText("Message the board assistant"), "Help me plan");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Thinking...")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    completeRequest(new Response(JSON.stringify({ assistantText: "Here is a plan." })));
    expect(await screen.findByText("Here is a plan.")).toBeVisible();
  });

  it("includes prior conversation history in subsequent requests", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ assistantText: "First reply" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ assistantText: "Second reply" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatSidebar boardId="7" onBoardUpdate={vi.fn()} />);

    const input = screen.getByLabelText("Message the board assistant");
    await user.type(input, "First question");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("First reply");
    await user.type(input, "Second question");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).history).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "First reply" },
    ]);
  });
});