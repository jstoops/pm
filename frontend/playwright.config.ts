import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL } from "./tests/global-setup";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  // Each test registers its own user, so tests never share board data.
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
