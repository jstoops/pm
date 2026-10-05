export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Fetches a JSON API route. Redirects to sign in on 401 (an expired session)
 * and throws an ApiError carrying the server's `detail` message for any failure.
 */
export const apiRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  if (response.status === 401) {
    window.location.assign("/login");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ApiError(
      response.status,
      typeof body?.detail === "string" ? body.detail : "The request failed."
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
};

export const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
