import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { Workspace } from "@/components/Workspace";
import { installFakeApi, requests, sampleBoard } from "@/test/fakeApi";

const boardList = () => within(screen.getByRole("navigation", { name: "Boards" }));
const selectedBoard = () =>
  boardList()
    .getAllByRole("button")
    .find((button) => button.getAttribute("aria-current") === "page");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const renderWorkspace = async (props: Parameters<typeof Workspace>[0] = {}) => {
  render(<Workspace {...props} />);
  await screen.findByLabelText("Board name");
};

describe("Workspace", () => {
  it("lists the user's boards and opens the first one", async () => {
    installFakeApi([sampleBoard("1", "Alpha"), sampleBoard("2", "Beta")]);
    await renderWorkspace();

    expect(boardList().getByRole("button", { name: /Alpha/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(boardList().getByRole("button", { name: /Beta/ })).toBeVisible();
    expect(screen.getByLabelText("Board name")).toHaveValue("Alpha");
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveTextContent("user");
  });

  it("switches boards and remembers the choice", async () => {
    const user = userEvent.setup();
    installFakeApi([sampleBoard("1", "Alpha"), sampleBoard("2", "Beta")]);
    await renderWorkspace();

    await user.click(boardList().getByRole("button", { name: /Beta/ }));

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Beta"));
    expect(window.localStorage.getItem("pm:selected-board")).toBe("2");
  });

  it("reopens the remembered board", async () => {
    window.localStorage.setItem("pm:selected-board", "2");
    installFakeApi([sampleBoard("1", "Alpha"), sampleBoard("2", "Beta")]);
    await renderWorkspace();

    expect(screen.getByLabelText("Board name")).toHaveValue("Beta");
  });

  it("creates a board and opens it", async () => {
    const user = userEvent.setup();
    const api = installFakeApi();
    await renderWorkspace();

    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("New board name"), "Launch");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Launch"));
    expect(selectedBoard()).toHaveTextContent("Launch");
    expect(screen.queryByLabelText("New board name")).not.toBeInTheDocument();
    expect(requests(api.fetchMock)).toContain("POST /api/boards");
  });

  it("reports a failed board creation", async () => {
    const user = userEvent.setup();
    const api = installFakeApi();
    await renderWorkspace();
    api.fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("New board name"), "Launch");
    await user.click(screen.getByRole("button", { name: "Create board" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to create the board/i);
  });

  it("keeps the sidebar card count and name in sync with board changes", async () => {
    const user = userEvent.setup();
    installFakeApi();
    await renderWorkspace();
    const column = screen.getAllByTestId(/^column-/)[0];

    await user.click(within(column).getByRole("button", { name: "Delete Roadmap" }));
    const input = screen.getByLabelText("Board name");
    await user.clear(input);
    await user.type(input, "Renamed{Enter}");

    await waitFor(() => expect(selectedBoard()).toHaveTextContent("Renamed"));
    expect(within(selectedBoard()!).getByLabelText("1 cards")).toBeVisible();
  });

  it("opens the next board after deleting one, then shows the empty state", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    installFakeApi([sampleBoard("1", "Alpha"), sampleBoard("2", "Beta")]);
    await renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(screen.getByLabelText("Board name")).toHaveValue("Beta"));
    expect(boardList().queryByRole("button", { name: /Alpha/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete board" }));
    expect(await screen.findByText("No boards yet")).toBeVisible();
  });

  it("shows a recoverable error when boards fail to load", async () => {
    const user = userEvent.setup();
    const api = installFakeApi();
    api.fetchMock.mockRejectedValueOnce(new Error("Network error"));
    render(<Workspace />);

    expect(await screen.findByText(/unable to load your boards/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Board name")).toBeVisible();
  });

  it("provides a logout control", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    installFakeApi();
    await renderWorkspace({ onLogout });

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(onLogout).toHaveBeenCalledOnce();
  });
});
