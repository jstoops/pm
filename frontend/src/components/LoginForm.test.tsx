import { afterEach, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/LoginForm";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LoginForm", () => {
  it("requires credentials", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Username")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
  });

  it("shows an error for rejected credentials", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Username"), "wrong");
    await user.type(screen.getByLabelText("Password"), "credentials");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in failed. Check your username and password."
    );
  });

  it("continues after a successful login", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const onAuthenticated = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginForm onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onAuthenticated).toHaveBeenCalledOnce();
  });
});