import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";
import { installFakeApi, requests, sampleBoard } from "@/test/fakeApi";

let api: ReturnType<typeof installFakeApi>;
const columns = () => screen.getAllByTestId(/^column-/);
const getFirstColumn = () => columns()[0];
const columnTitles = () =>
  columns().map((column) => (within(column).getByLabelText("Column title") as HTMLInputElement).value);

beforeEach(() => {
  api = installFakeApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderBoard = async (props: Partial<Parameters<typeof KanbanBoard>[0]> = {}) => {
  render(<KanbanBoard boardId="1" {...props} />);
  await screen.findByTestId("column-11");
};

describe("KanbanBoard", () => {
  it("loads the board's columns and summary from the API", async () => {
    await renderBoard();

    expect(columns()).toHaveLength(5);
    expect(screen.getByLabelText("Board name")).toHaveValue("My first board");
    expect(screen.getByText("2 cards across 5 columns")).toBeVisible();
    expect(requests(api.fetchMock)).toEqual(["GET /api/boards/1"]);
  });

  it("renames the board and reports the change", async () => {
    const user = userEvent.setup();
    const onBoardChange = vi.fn();
    await renderBoard({ onBoardChange });
    const input = screen.getByLabelText("Board name");
    await user.clear(input);
    await user.type(input, "Launch plan{Enter}");

    await waitFor(() =>
      expect(onBoardChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Launch plan" }))
    );
    expect(requests(api.fetchMock)).toContain("PATCH /api/boards/1");
  });

  it("deletes the board only after confirmation", async () => {
    const user = userEvent.setup();
    const onBoardDeleted = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderBoard({ onBoardDeleted });

    await user.click(screen.getByRole("button", { name: "Delete board" }));
    expect(onBoardDeleted).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete board" }));

    await waitFor(() => expect(onBoardDeleted).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalledWith('Delete "My first board" and all of its cards?');
    expect(api.boards.has("1")).toBe(false);
  });

  it("renames a column", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.tab();

    await waitFor(() => expect(api.boards.get("1")?.columns[0].title).toBe("New Name"));
    expect(input).toHaveValue("New Name");
  });

  it("restores a blank column title without saving it", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await user.clear(input);
    await user.tab();

    expect(input).toHaveValue("Backlog");
    expect(api.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("adds a column at the end of the board", async () => {
    const user = userEvent.setup();
    await renderBoard();
    await user.click(screen.getByRole("button", { name: "Add column" }));
    await user.type(screen.getByLabelText("New column title"), "Blocked");
    await user.click(screen.getByRole("button", { name: "Add column" }));

    await waitFor(() => expect(columns()).toHaveLength(6));
    expect(columnTitles().at(-1)).toBe("Blocked");
  });

  it("moves columns left and right from the column menu", async () => {
    const user = userEvent.setup();
    await renderBoard();

    await user.click(screen.getByRole("button", { name: "Actions for Backlog" }));
    expect(screen.getByRole("menuitem", { name: "Move left" })).toBeDisabled();
    await user.click(screen.getByRole("menuitem", { name: "Move right" }));
    await waitFor(() => expect(columnTitles().slice(0, 2)).toEqual(["Discovery", "Backlog"]));

    await user.click(screen.getByRole("button", { name: "Actions for Backlog" }));
    await user.click(screen.getByRole("menuitem", { name: "Move left" }));
    await waitFor(() => expect(columnTitles().slice(0, 2)).toEqual(["Backlog", "Discovery"]));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("deletes an empty column without asking and a non-empty one after confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderBoard();

    await user.click(screen.getByRole("button", { name: "Actions for Discovery" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete column" }));
    await waitFor(() => expect(columns()).toHaveLength(4));
    expect(confirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Actions for Backlog" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete column" }));
    expect(confirm).toHaveBeenCalledWith('Delete "Backlog" and its 2 cards?');
    expect(columns()).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Actions for Backlog" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete column" }));
    await waitFor(() => expect(columns()).toHaveLength(3));
    expect(screen.getByText("0 cards across 3 columns")).toBeVisible();
  });

  it("closes the column menu with Escape", async () => {
    const user = userEvent.setup();
    await renderBoard();
    await user.click(screen.getByRole("button", { name: "Actions for Backlog" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
    expect(api.fetchMock).toHaveBeenCalledWith(
      "/api/boards/1/cards/101",
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
    await user.click(within(column).getByRole("button", { name: /add a card/i }));
    await user.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await user.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await user.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();

    await user.click(within(column).getByRole("button", { name: /delete new card/i }));

    await waitFor(() => {
      expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    });
  });

  it("shows a recoverable error when loading fails", async () => {
    api.fetchMock.mockRejectedValueOnce(new Error("Network error"));
    const user = userEvent.setup();
    render(<KanbanBoard boardId="1" />);

    expect(await screen.findByText(/unable to load the board/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("column-11")).toBeVisible();
  });

  it("keeps the board visible and reports a failed save", async () => {
    const user = userEvent.setup();
    await renderBoard();
    api.fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const input = within(getFirstColumn()).getByLabelText("Column title");
    await user.clear(input);
    await user.type(input, "Blocked rename");
    await user.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(/board is unchanged/i);
    expect(columns()).toHaveLength(5);
  });

  it("reports a failed board deletion", async () => {
    const user = userEvent.setup();
    const onBoardDeleted = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderBoard({ onBoardDeleted });
    api.fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await user.click(screen.getByRole("button", { name: "Delete board" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to delete the board/i);
    expect(onBoardDeleted).not.toHaveBeenCalled();
  });

  it("hides and shows the assistant", async () => {
    const user = userEvent.setup();
    await renderBoard();
    const toggle = screen.getByRole("button", { name: "Toggle assistant" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("ai-chat-sidebar").parentElement).toHaveClass("hidden");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("updates the visible board after an AI response includes a board update", async () => {
    const user = userEvent.setup();
    const onBoardChange = vi.fn();
    await renderBoard({ onBoardChange });
    const board = sampleBoard();
    const updatedBoard: BoardData = {
      ...board,
      columns: board.columns.map((column, index) =>
        index === 0 ? { ...column, title: "AI Backlog" } : column
      ),
    };
    api.fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ assistantText: "Renamed the column.", board: updatedBoard }),
        { status: 200 }
      )
    );

    await user.type(screen.getByLabelText("Message the board assistant"), "Rename Backlog");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Renamed the column.")).toBeVisible();
    expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("AI Backlog");
    expect(api.fetchMock).toHaveBeenLastCalledWith("/api/boards/1/chat", expect.anything());
    expect(onBoardChange).toHaveBeenCalledWith(updatedBoard);
  });
});
