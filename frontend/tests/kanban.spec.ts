import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

const createCard = async (page: Page, title: string) => {
  const column = page.locator('[data-testid^="column-"]').first();
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill(title);
  await column.getByPlaceholder("Details").fill("Created by Playwright.");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText(title)).toBeVisible();
};

const uniqueTitle = (prefix: string) => `${prefix} ${Date.now()}`;

const cardTitles = (page: Page, columnIndex: number) =>
  page
    .locator('[data-testid^="column-"]')
    .nth(columnIndex)
    .locator('[data-testid^="card-"] h4')
    .allInnerTexts();

type Board = {
  columns: { id: string; cardIds: string[] }[];
  cards: Record<string, { title: string }>;
};

/** Replaces the saved cards with Alpha, Beta, Gamma in the first column and Solo in the second. */
const resetCards = async (page: Page) => {
  const board = (await (await page.request.get("/api/board")).json()) as Board;
  for (const cardId of Object.keys(board.cards)) {
    await page.request.delete(`/api/board/cards/${cardId}`);
  }
  for (const [columnIndex, title] of [
    [0, "Alpha"],
    [0, "Beta"],
    [0, "Gamma"],
    [1, "Solo"],
  ] as const) {
    await page.request.post("/api/board/cards", {
      data: { column_id: Number(board.columns[columnIndex].id), title, details: "" },
    });
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: "Gamma", exact: true })).toBeVisible();
};

/** Drops the named card directly above the card at `cardIndex` of the given column. */
const dragCardAbove = async (
  page: Page,
  title: string,
  columnIndex: number,
  cardIndex: number
) => {
  const card = page
    .locator('[data-testid^="card-"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const target = page
    .locator('[data-testid^="column-"]')
    .nth(columnIndex)
    .locator('[data-testid^="card-"]')
    .nth(cardIndex);
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  const moveResponse = page.waitForResponse(
    (response) => response.url().includes("/move") && response.status() === 200
  );
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + 6,
    { steps: 15 }
  );
  await page.mouse.up();
  await moveResponse;
};

test("requires login before showing the board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).not.toBeVisible();
});

test.describe("authenticated board", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the kanban board", async ({ page }) => {
    await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  });

  test("persists a new card after reload", async ({ page }) => {
    const title = uniqueTitle("Persistent card");
    await createCard(page, title);

    await page.reload();

    await expect(page.getByText(title)).toBeVisible();
  });

  test("persists a moved card in its new column after reload", async ({ page }) => {
    await page.setViewportSize({ width: 1624, height: 1069 });
    const title = uniqueTitle("Moved card");
    await createCard(page, title);

    const card = page.getByText(title).locator("..");
    const targetColumn = page.locator('[data-testid^="column-"]').nth(1);
    await card.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    const targetBox = await targetColumn.boundingBox();
    if (!cardBox || !targetBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }

    await page.mouse.move(
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2
    );
    await page.mouse.down();
    const moveResponse = page.waitForResponse(
      (response) => response.url().includes("/move") && response.status() === 200
    );
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      cardBox.y + cardBox.height / 2,
      { steps: 12 }
    );
    await page.mouse.up();
    await moveResponse;

    await expect(targetColumn.getByText(title)).toBeVisible();
    await page.reload();
    await expect(targetColumn.getByText(title)).toBeVisible();
  });

  test("persists an edited card after reload", async ({ page }) => {
    const title = uniqueTitle("Editable card");
    await createCard(page, title);
    const cardTestId = await page
      .locator('[data-testid^="card-"]')
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
      .getAttribute("data-testid");
    const card = page.getByTestId(cardTestId!);

    await card.getByRole("button", { name: `Edit ${title}` }).click();
    await card.getByLabel("Card title").fill(`${title} edited`);
    await card.getByLabel("Card details").fill("Edited by Playwright.");
    const saved = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.ok()
    );
    await card.getByRole("button", { name: "Save" }).click();
    await saved;

    await page.reload();
    await expect(page.getByRole("heading", { name: `${title} edited` })).toBeVisible();
    await expect(page.getByText("Edited by Playwright.")).toBeVisible();
  });

  test("returns to sign in when the session has expired", async ({ page }) => {
    await page.context().clearCookies();
    const column = page.locator('[data-testid^="column-"]').first();
    await column.getByRole("button", { name: /add a card/i }).click();
    await column.getByPlaceholder("Card title").fill("Unsaved card");
    await column.getByRole("button", { name: /add card/i }).click();

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("shows an AI board update without a manual reload", async ({ page }) => {
    const board = (await (await page.request.get("/api/board")).json()) as Board & {
      columns: { id: string; title: string; cardIds: string[] }[];
    };
    const updatedBoard = {
      ...board,
      columns: board.columns.map((column, index) =>
        index === 0 ? { ...column, title: "AI Backlog" } : column
      ),
    };
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          assistantText: "Renamed the backlog.",
          board: updatedBoard,
        }),
      });
    });

    await page.getByLabel("Message the board assistant").fill("Rename Backlog");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Renamed the backlog.")).toBeVisible();
    await expect(page.locator('[data-testid^="column-"]').first().getByLabel("Column title"))
      .toHaveValue("AI Backlog");
  });

  test("keeps board and assistant access on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
    const assistant = page.getByTestId("ai-chat-sidebar");
    await assistant.scrollIntoViewIfNeeded();
    await expect(assistant).toBeVisible();
    await expect(assistant.getByLabel("Message the board assistant")).toBeVisible();
  });

  test.describe("drops near the top of a column", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1624, height: 1069 });
      await resetCards(page);
    });

    const expectFirstColumn = async (page: Page, expected: string[]) => {
      await expect.poll(() => cardTitles(page, 0)).toEqual(expected);
      await page.reload();
      await expect.poll(() => cardTitles(page, 0)).toEqual(expected);
    };

    test("takes a card from another column above the top card", async ({ page }) => {
      await dragCardAbove(page, "Solo", 0, 0);

      await expectFirstColumn(page, ["Solo", "Alpha", "Beta", "Gamma"]);
      expect(await cardTitles(page, 1)).toEqual([]);
    });

    test("takes a card from another column between the top two cards", async ({ page }) => {
      await dragCardAbove(page, "Solo", 0, 1);

      await expectFirstColumn(page, ["Alpha", "Solo", "Beta", "Gamma"]);
    });

    test("moves a card above the top card of its own column", async ({ page }) => {
      await dragCardAbove(page, "Gamma", 0, 0);

      await expectFirstColumn(page, ["Gamma", "Alpha", "Beta"]);
    });

    test("moves a card between the top two cards of its own column", async ({ page }) => {
      await dragCardAbove(page, "Gamma", 0, 1);

      await expectFirstColumn(page, ["Alpha", "Gamma", "Beta"]);
    });

    test("moves a card down its column with the keyboard", async ({ page }) => {
      const moveResponse = page.waitForResponse(
        (response) => response.url().includes("/move") && response.status() === 200
      );
      const card = page
        .locator('[data-testid^="card-"]')
        .filter({ has: page.getByRole("heading", { name: "Alpha", exact: true }) });
      const dragId = (await card.getAttribute("data-testid"))!.replace("card-", "card:");
      await card.focus();
      // dnd-kit announces each keyboard drag step. The keyboard sensor attaches
      // its keydown listener in a setTimeout after the pickup announcement, so
      // one more page timer turn guarantees ArrowDown is not dropped.
      const announcement = page.getByRole("status");
      await page.keyboard.press("Space");
      await expect(announcement).toContainText(`over droppable area ${dragId}.`);
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
      await page.keyboard.press("ArrowDown");
      await expect(announcement).not.toContainText(`over droppable area ${dragId}.`);
      await page.keyboard.press("Space");
      await moveResponse;

      await expectFirstColumn(page, ["Beta", "Alpha", "Gamma"]);
    });
  });
});

test("preserves board data after logout and login", async ({ page }) => {
  await signIn(page);
  const title = uniqueTitle("Logged out card");
  await createCard(page, title);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await signIn(page);
  await expect(page.getByText(title)).toBeVisible();
});