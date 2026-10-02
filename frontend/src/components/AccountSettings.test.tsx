import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import { AccountSettings } from "@/components/AccountSettings";

const account = { username: "alice", createdAt: "2026-09-30 12:00:00", boardCount: 2 };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) =>
    url === "/api/account"
      ? new Response(JSON.stringify(account), { status: 200 })
      : new Response(null, { status: 204 })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const changePassword = async (current: string, next: string, confirmation = next) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), next);
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Update password" }));
};

describe("AccountSettings", () => {
  it("shows the signed-in account", async () => {
    render(<AccountSettings />);

    expect(await screen.findByTestId("account-username")).toHaveTextContent("alice");
    expect(screen.getByText(/2 boards - member since/)).toBeVisible();
  });

  it("reports an account that cannot be loaded", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    render(<AccountSettings />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load your account/i);
  });

  it("changes the password and clears the form", async () => {
    render(<AccountSettings />);

    await changePassword("old-password", "new-password");

    expect(await screen.findByRole("status")).toHaveTextContent("Password updated.");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/password",
      expect.objectContaining({
        body: JSON.stringify({ current_password: "old-password", new_password: "new-password" }),
      })
    );
  });

  it("rejects mismatched new passwords without a request", async () => {
    render(<AccountSettings />);

    await changePassword("old-password", "new-password", "other-password");

    expect(screen.getByRole("alert")).toHaveTextContent("New passwords do not match.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains an incorrect current password", async () => {
    render(<AccountSettings />);
    await screen.findByTestId("account-username");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await changePassword("wrong-password", "new-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect.");
  });

  it("deletes the account only after confirmation", async () => {
    const user = userEvent.setup();
    const onAccountDeleted = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<AccountSettings onAccountDeleted={onAccountDeleted} />);
    const deleteSection = screen.getByRole("heading", { name: "Delete account" }).parentElement!;
    await user.type(deleteSection.querySelector("input")!, "my-password");

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/account/delete", expect.anything());
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(onAccountDeleted).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/delete",
      expect.objectContaining({ body: JSON.stringify({ password: "my-password" }) })
    );
  });

  it("explains an incorrect password when deleting", async () => {
    const user = userEvent.setup();
    const onAccountDeleted = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AccountSettings onAccountDeleted={onAccountDeleted} />);
    await screen.findByTestId("account-username");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect.");
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });
});
