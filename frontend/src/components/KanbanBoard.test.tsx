import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];
let board: BoardData;

const response = () => new Response(JSON.stringify(board), { status: 200 });

const apiBoard = (): BoardData => ({
  columns: [
    { id: "1", title: "Backlog", cardIds: ["1", "2"] },
    { id: "2", title: "Discovery", cardIds: [] },
    { id: "3", title: "In Progress", cardIds: [] },
    { id: "4", title: "Review", cardIds: [] },
    { id: "5", title: "Done", cardIds: [] },
  ],
  cards: {
    "1": { id: "1", title: "Roadmap", details: "Plan the next release." },
    "2": { id: "2", title: "Research", details: "Collect user feedback." },
  },
});

beforeEach(() => {
  board = apiBoard();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/board" && !init?.method) {
        return response();
      }

      const payload = init?.body ? JSON.parse(init.body as string) : undefined;
      if (url.startsWith("/api/board/columns/")) {
        const columnId = url.split("/").at(-1);
        board.columns = board.columns.map((column) =>
          column.id === columnId ? { ...column, title: payload.title } : column
        );
      } else if (url === "/api/board/cards") {
        const cardId = "card-test";
        board.cards[cardId] = { id: cardId, title: payload.title, details: payload.details };
        board.columns = board.columns.map((column) =>
          column.id === String(payload.column_id)
            ? { ...column, cardIds: [...column.cardIds, cardId] }
            : column
        );
      } else if (init?.method === "PATCH") {
        const cardId = url.split("/").at(-1) ?? "";
        board.cards[cardId] = { ...board.cards[cardId], ...payload };
      } else if (init?.method === "DELETE") {
        const cardId = url.split("/").at(-1) ?? "";
        delete board.cards[cardId];
        board.columns = board.columns.map((column) => ({
          ...column,
          cardIds: column.cardIds.filter((id) => id !== cardId),
        }));
      }
      return response();
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderBoard = async (onLogout?: () => void) => {
  render(<KanbanBoard onLogout={onLogout} />);
  await screen.findByTestId("column-1");
};

describe("KanbanBoard", () => {
  it("loads five columns from the API", async () => {
    await renderBoard();

    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.tab();

    expect(input).toHaveValue("New Name");
  });

  it("restores a blank column title without saving it", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await user.clear(input);
    await user.tab();

    expect(input).toHaveValue("Backlog");
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it("edits a card", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const column = getFirstColumn();
    await user.click(within(column).getByRole("button", { name: "Edit Roadmap" }));

    const titleInput = within(column).getByLabelText("Card title");
    await user.clear(titleInput);
    await user.type(titleInput, "Roadmap v2");
    const detailsInput = within(column).getByLabelText("Card details");
    await user.clear(detailsInput);
    await user.type(detailsInput, "Revised plan.");
    await user.click(within(column).getByRole("button", { name: "Save" }));

    expect(await within(column).findByText("Roadmap v2")).toBeInTheDocument();
    expect(within(column).getByText("Revised plan.")).toBeInTheDocument();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "/api/board/cards/1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Roadmap v2", details: "Revised plan." }),
      })
    );
  });

  it("adds and removes a card", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await user.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await user.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await user.type(detailsInput, "Notes");

    await user.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    });
  });

  it("provides a logout control", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    await renderBoard(onLogout);

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("shows a recoverable error when loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(new Response(JSON.stringify(board), { status: 200 }))
    );
    const user = userEvent.setup();
    render(<KanbanBoard />);

    expect(await screen.findByText(/unable to load the board/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("column-1")).toBeVisible();
  });

  it("keeps the board visible and reports a failed save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(board), { status: 200 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await renderBoard();

    const input = within(getFirstColumn()).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "Blocked rename");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(/board is unchanged/i);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("updates the visible board after an AI response includes a board update", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const updatedBoard: BoardData = {
      ...board,
      columns: board.columns.map((column) =>
        column.id === "1" ? { ...column, title: "AI Backlog" } : column
      ),
    };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ assistantText: "Renamed the column.", board: updatedBoard }),
        { status: 200 }
      )
    );

    await user.type(screen.getByLabelText("Message the board assistant"), "Rename Backlog");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Renamed the column.")).toBeVisible();
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("AI Backlog");
  });
});
