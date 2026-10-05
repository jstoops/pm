import { expect, test, type Page } from "@playwright/test";

type Board = {
  id: string;
  name: string;
  columns: { id: string; title: string; cardIds: string[] }[];
  cards: Record<string, { title: string }>;
};

const PASSWORD = "e2e-password";
let userCount = 0;
const uniqueName = (prefix: string) => `${prefix}_${Date.now()}_${userCount++}`;
const uniqueTitle = (prefix: string) => `${prefix} ${Date.now()}`;

/** Registers a fresh user (signed in through the page's cookies) and opens the workspace. */
const registerUser = async (page: Page) => {
  const username = uniqueName("e2e");
  const response = await page.request.post("/api/auth/register", {
    data: { username, password: PASSWORD },
  });
  expect(response.status()).toBe(201);
  await page.goto("/");
  await expect(boardName(page)).toHaveValue("My first board");
  return username;
};

const signIn = async (page: Page, username: string, password: string) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
};

const currentBoard = async (page: Page) => {
  const boards = (await (await page.request.get("/api/boards")).json()) as { id: string }[];
  return (await (await page.request.get(`/api/boards/${boards[0].id}`)).json()) as Board;
};

const columns = (page: Page) => page.locator('[data-testid^="column-"]');

const boardName = (page: Page) => page.getByLabel("Board name", { exact: true });

const columnTitles = (page: Page) =>
  columns(page).getByLabel("Column title").evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value)
  );

const createCard = async (page: Page, title: string, columnIndex = 0) => {
  const column = columns(page).nth(columnIndex);
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill(title);
  await column.getByPlaceholder("Details").fill("Created by Playwright.");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText(title)).toBeVisible();
};

const cardByTitle = (page: Page, title: string) =>
  page
    .locator('[data-testid^="card-"]')
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

const waitForMove = (page: Page) =>
  page.waitForResponse((response) => response.url().includes("/move") && response.status() === 200);

const cardTitles = (page: Page, columnIndex: number) =>
  columns(page).nth(columnIndex).locator('[data-testid^="card-"] h4').allInnerTexts();

const boardButton = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Boards" }).getByRole("button", { name });

/** Replaces the saved cards with Alpha, Beta, Gamma in the first column and Solo in the second. */
const resetCards = async (page: Page) => {
  const board = await currentBoard(page);
  const base = `/api/boards/${board.id}`;
  for (const cardId of Object.keys(board.cards)) {
    await page.request.delete(`${base}/cards/${cardId}`);
  }
  for (const [columnIndex, title] of [
    [0, "Alpha"],
    [0, "Beta"],
    [0, "Gamma"],
    [1, "Solo"],
  ] as const) {
    await page.request.post(`${base}/cards`, {
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
  const card = cardByTitle(page, title);
  const target = columns(page).nth(columnIndex).locator('[data-testid^="card-"]').nth(cardIndex);
  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  const moveResponse = waitForMove(page);
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 6, { steps: 15 });
  await page.mouse.up();
  await moveResponse;
};

test.describe("signed out", () => {
  test("requires login before showing the board", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kanban Studio" })).not.toBeVisible();

    await page.goto("/account");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signs in with the demo account", async ({ page }) => {
    await signIn(page, "user", "password");
    await expect(boardName(page)).toBeVisible();
    await expect(columns(page).first()).toBeVisible();
  });

  test("rejects a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Sign in failed");
  });

  test("registers a new account from the sign-in page", async ({ page }) => {
    const username = uniqueName("signup");
    await page.goto("/login");
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(boardName(page)).toHaveValue("My first board");
    await expect(page.getByRole("link", { name: "Account settings" })).toContainText(username);
    await expect(columns(page)).toHaveCount(5);
  });

  test("explains a taken username", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Username").fill("user");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("That username is taken");
  });
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page);
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
    const targetColumn = columns(page).nth(1);
    await card.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    const targetBox = await targetColumn.boundingBox();
    if (!cardBox || !targetBox) {
      throw new Error("Unable to resolve drag coordinates.");
    }

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    const moveResponse = waitForMove(page);
    await page.mouse.move(targetBox.x + targetBox.width / 2, cardBox.y + cardBox.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await moveResponse;

    await expect(targetColumn.getByText(title)).toBeVisible();
    await page.reload();
    await expect(targetColumn.getByText(title)).toBeVisible();
  });

  test("persists an edited card after reload", async ({ page }) => {
    const title = uniqueTitle("Editable card");
    await createCard(page, title);
    // Editing replaces the title heading, so locate the card by its stable test id.
    const cardTestId = await cardByTitle(page, title).getAttribute("data-testid");
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
    const column = columns(page).first();
    await column.getByRole("button", { name: /add a card/i }).click();
    await column.getByPlaceholder("Card title").fill("Unsaved card");
    await column.getByRole("button", { name: /add card/i }).click();

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("shows an AI board update without a manual reload", async ({ page }) => {
    const board = await currentBoard(page);
    const updatedBoard = {
      ...board,
      columns: board.columns.map((column, index) =>
        index === 0 ? { ...column, title: "AI Backlog" } : column
      ),
    };
    await page.route(`**/api/boards/${board.id}/chat`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ assistantText: "Renamed the backlog.", board: updatedBoard }),
      });
    });

    await page.getByLabel("Message the board assistant").fill("Rename Backlog");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Renamed the backlog.")).toBeVisible();
    await expect(columns(page).first().getByLabel("Column title")).toHaveValue("AI Backlog");
  });

  test("keeps board and assistant access on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await expect(columns(page).first()).toBeVisible();
    await expect(boardButton(page, /My first board/)).toBeVisible();
    const assistant = page.getByTestId("ai-chat-sidebar");
    await assistant.scrollIntoViewIfNeeded();
    await expect(assistant).toBeVisible();
    await expect(assistant.getByLabel("Message the board assistant")).toBeVisible();
  });

  test("keeps separate boards, each with its own cards", async ({ page }) => {
    await page.getByRole("button", { name: "New board" }).click();
    await page.getByLabel("New board name").fill("Launch plan");
    await page.getByRole("button", { name: "Create board" }).click();
    await expect(boardName(page)).toHaveValue("Launch plan");
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);
    await createCard(page, "Launch task");

    await boardButton(page, /My first board/).click();
    await expect(boardName(page)).toHaveValue("My first board");
    await expect(page.getByText("Launch task")).not.toBeVisible();

    // The last opened board reopens after a reload.
    await boardButton(page, /Launch plan/).click();
    await page.reload();
    await expect(boardName(page)).toHaveValue("Launch plan");
    await expect(page.getByText("Launch task")).toBeVisible();
    await expect(boardButton(page, /Launch plan/)).toContainText("1");
  });

  test("renames and deletes a board", async ({ page }) => {
    const name = boardName(page);
    await name.fill("Renamed board");
    const saved = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.ok()
    );
    await name.press("Enter");
    await saved;
    await expect(boardButton(page, /Renamed board/)).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete board" }).click();
    await expect(page.getByText("No boards yet")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No boards yet")).toBeVisible();
  });

  test("adds, reorders and deletes columns", async ({ page }) => {
    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("New column title").fill("Blocked");
    await page.getByRole("button", { name: "Add column" }).click();
    await expect(columns(page)).toHaveCount(6);

    await page.getByRole("button", { name: "Actions for Blocked" }).click();
    await page.getByRole("menuitem", { name: "Move left" }).click();
    await expect
      .poll(() => columnTitles(page))
      .toEqual(["Backlog", "Discovery", "In Progress", "Review", "Blocked", "Done"]);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Actions for Backlog" }).click();
    await page.getByRole("menuitem", { name: "Delete column" }).click();
    await expect(columns(page)).toHaveCount(5);

    await page.reload();
    await expect
      .poll(() => columnTitles(page))
      .toEqual(["Discovery", "In Progress", "Review", "Blocked", "Done"]);
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
      const moveResponse = waitForMove(page);
      const card = cardByTitle(page, "Alpha");
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

test.describe("account", () => {
  test("preserves board data after logout and login", async ({ page }) => {
    const username = await registerUser(page);
    const title = uniqueTitle("Logged out card");
    await createCard(page, title);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    await signIn(page, username, PASSWORD);
    await expect(page.getByText(title)).toBeVisible();
  });

  test("changes the password", async ({ page }) => {
    const username = await registerUser(page);
    await page.getByRole("link", { name: "Account settings" }).click();
    await expect(page.getByTestId("account-username")).toHaveText(username);

    await page.getByLabel("Current password").fill(PASSWORD);
    await page.getByLabel("New password", { exact: true }).fill("changed-password");
    await page.getByLabel("Confirm new password").fill("changed-password");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toHaveText("Password updated.");

    await page.getByRole("link", { name: "Back to boards" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await signIn(page, username, "changed-password");
  });

  test("deletes the account", async ({ page }) => {
    const username = await registerUser(page);
    await page.goto("/account");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete account" }).click();

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const login = await page.request.post("/api/auth/login", {
      data: { username, password: PASSWORD },
    });
    expect(login.status()).toBe(401);
  });
});
