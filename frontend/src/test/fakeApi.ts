import { vi } from "vitest";
import { summarizeBoard, type BoardData } from "@/lib/kanban";

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

export const sampleBoard = (id = "1", name = "My first board"): BoardData => ({
  id,
  name,
  description: "",
  columns: [
    { id: `${id}1`, title: "Backlog", cardIds: [`${id}01`, `${id}02`] },
    { id: `${id}2`, title: "Discovery", cardIds: [] },
    { id: `${id}3`, title: "In Progress", cardIds: [] },
    { id: `${id}4`, title: "Review", cardIds: [] },
    { id: `${id}5`, title: "Done", cardIds: [] },
  ],
  cards: {
    [`${id}01`]: { id: `${id}01`, title: "Roadmap", details: "Plan the next release." },
    [`${id}02`]: { id: `${id}02`, title: "Research", details: "Collect user feedback." },
  },
});

/**
 * An in-memory stand-in for the board API, installed as the global fetch. It
 * applies each request to its copy of the boards and answers like the backend.
 */
export const installFakeApi = (initialBoards: BoardData[] = [sampleBoard()]) => {
  const boards = new Map(initialBoards.map((board) => [board.id, structuredClone(board)]));
  let nextId = 900;
  const newId = () => String(nextId++);

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    if (url === "/api/auth/session") {
      return json({ authenticated: true, username: "user" });
    }
    if (url === "/api/boards") {
      if (method === "POST") {
        const board = { ...sampleBoard(newId(), body.name), cards: {} };
        board.columns = board.columns.map((column) => ({ ...column, cardIds: [] }));
        boards.set(board.id, board);
        return json(board, 201);
      }
      return json(
        [...boards.values()].map((board) => ({ ...summarizeBoard(board), updatedAt: "" }))
      );
    }

    const [, boardId, rest] = url.match(/^\/api\/boards\/(\w+)(.*)$/) ?? [];
    const board = boards.get(boardId);
    if (!board) {
      return json({ detail: "Board not found." }, 404);
    }
    const [, kind, itemId, action] = rest.split("/");
    const removeCards = (cardIds: string[]) => cardIds.forEach((id) => delete board.cards[id]);

    if (!kind) {
      if (method === "DELETE") {
        boards.delete(boardId);
        return json(undefined, 204);
      }
      Object.assign(board, body);
    } else if (kind === "columns") {
      const index = board.columns.findIndex((column) => column.id === itemId);
      if (method === "POST" && !itemId) {
        board.columns.push({ id: newId(), title: body.title, cardIds: [] });
      } else if (action === "move") {
        const [column] = board.columns.splice(index, 1);
        board.columns.splice(body.position, 0, column);
      } else if (method === "PATCH") {
        board.columns[index] = { ...board.columns[index], title: body.title };
      } else if (method === "DELETE") {
        removeCards(board.columns[index].cardIds);
        board.columns.splice(index, 1);
      }
    } else if (kind === "cards") {
      const withoutCard = () =>
        board.columns.map((column) => ({
          ...column,
          cardIds: column.cardIds.filter((id) => id !== itemId),
        }));
      if (method === "POST" && !itemId) {
        const cardId = newId();
        board.cards[cardId] = { id: cardId, title: body.title, details: body.details };
        board.columns = board.columns.map((column) =>
          column.id === String(body.column_id)
            ? { ...column, cardIds: [...column.cardIds, cardId] }
            : column
        );
      } else if (action === "move") {
        board.columns = withoutCard().map((column) =>
          column.id === String(body.column_id)
            ? { ...column, cardIds: column.cardIds.toSpliced(body.position, 0, itemId) }
            : column
        );
      } else if (method === "PATCH") {
        board.cards[itemId] = { ...board.cards[itemId], ...body };
      } else if (method === "DELETE") {
        removeCards([itemId]);
        board.columns = withoutCard();
      }
    }
    return json(board);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, boards };
};

/** The method and URL of every request made so far, for asserting on traffic. */
export const requests = (fetchMock: ReturnType<typeof installFakeApi>["fetchMock"]) =>
  fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
