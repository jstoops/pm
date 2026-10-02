import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import { RegisterForm } from "@/components/RegisterForm";

afterEach(() => {
  vi.unstubAllGlobals();
});

const fillForm = async (password = "long-password", confirmation = password) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Username"), "new.user");
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Confirm password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Create account" }));
};

describe("RegisterForm", () => {
  it("creates the account and continues to the workspace", async () => {
    const onRegistered = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ authenticated: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm onRegistered={onRegistered} />);

    await fillForm();

    await waitFor(() => expect(onRegistered).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "new.user", password: "long-password" }),
      })
    );
  });

  it("rejects mismatched passwords without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<RegisterForm onRegistered={vi.fn()} />);

    await fillForm("long-password", "different-password");

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a taken username", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "That username is taken." }), { status: 409 })
      )
    );
    const onRegistered = vi.fn();
    render(<RegisterForm onRegistered={onRegistered} />);

    await fillForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(/username is taken/i);
    expect(onRegistered).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("reports other failures generically", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 422 })));
    render(<RegisterForm onRegistered={vi.fn()} />);

    await fillForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to create the account/i);
  });
});
