import { afterEach, vi } from "vitest";
import { ApiError, apiRequest, jsonRequest } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("returns parsed JSON, or undefined for 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
    );

    expect(await apiRequest("/api/a")).toEqual({ ok: 1 });
    expect(await apiRequest("/api/b", { method: "DELETE" })).toBeUndefined();
  });

  it("throws an ApiError with the server detail or a fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Board not found." }), { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ detail: [{ msg: "bad" }] }), { status: 422 }))
        .mockResolvedValueOnce(new Response("not json", { status: 500 }))
    );

    await expect(apiRequest("/api/a")).rejects.toEqual(new ApiError(404, "Board not found."));
    await expect(apiRequest("/api/a")).rejects.toMatchObject({ status: 422, message: "The request failed." });
    await expect(apiRequest("/api/a")).rejects.toMatchObject({ status: 500 });
  });

  it("redirects to sign in when the session has expired", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(apiRequest("/api/a")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/login");
  });
});

describe("jsonRequest", () => {
  it("builds a JSON request", () => {
    expect(jsonRequest("PATCH", { title: "x" })).toEqual({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: '{"title":"x"}',
    });
  });
});
