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