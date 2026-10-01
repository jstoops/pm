import { cardDragId, columnDropId, moveCard, parseDragId, type Column } from "@/lib/kanban";

describe("drag identifiers", () => {
  it("keeps card and column identifiers apart when database ids collide", () => {
    expect(cardDragId("1")).not.toEqual(columnDropId("1"));
    expect(parseDragId(cardDragId("1"))).toEqual({ type: "card", id: "1" });
    expect(parseDragId(columnDropId("1"))).toEqual({ type: "column", id: "1" });
  });
});

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", { type: "card", id: "card-1" });
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("places a card behind the target card when requested", () => {
    const result = moveCard(baseColumns, "card-1", { type: "card", id: "card-2" }, true);
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", { type: "card", id: "card-3" });
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", { type: "column", id: "col-b" });
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("keeps the slot the pointer is over when dragging down a column", () => {
    const columns: Column[] = [
      { id: "col-a", title: "A", cardIds: ["a", "b", "c", "d"] },
    ];

    expect(moveCard(columns, "a", { type: "card", id: "d" })[0].cardIds).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("moves a card to the top of a column whose id matches a card id", () => {
    const columns: Column[] = [
      { id: "1", title: "Backlog", cardIds: ["1", "2"] },
      { id: "2", title: "Discovery", cardIds: ["3"] },
    ];

    const toTop = moveCard(columns, "3", { type: "card", id: "1" });
    expect(toTop[0].cardIds).toEqual(["3", "1", "2"]);
    expect(toTop[1].cardIds).toEqual([]);

    const betweenTopCards = moveCard(columns, "3", { type: "card", id: "2" });
    expect(betweenTopCards[0].cardIds).toEqual(["1", "3", "2"]);

    const wholeColumn = moveCard(columns, "3", { type: "column", id: "1" });
    expect(wholeColumn[0].cardIds).toEqual(["1", "2", "3"]);
  });

  it("reorders the top cards of a column whose id matches a card id", () => {
    const columns: Column[] = [{ id: "1", title: "Backlog", cardIds: ["1", "2", "3"] }];

    expect(moveCard(columns, "2", { type: "card", id: "1" })[0].cardIds).toEqual([
      "2",
      "1",
      "3",
    ]);
    expect(moveCard(columns, "3", { type: "card", id: "2" })[0].cardIds).toEqual([
      "1",
      "3",
      "2",
    ]);
  });

  it("ignores unknown cards and columns", () => {
    expect(moveCard(baseColumns, "missing", { type: "card", id: "card-1" })).toBe(
      baseColumns
    );
    expect(moveCard(baseColumns, "card-1", { type: "column", id: "missing" })).toBe(
      baseColumns
    );
  });
});
