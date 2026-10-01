import { execSync } from "node:child_process";
import path from "node:path";

const E2E_PORT = "8001";
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

/** Runs the app as a separate Compose project so tests never touch the real board data. */
const compose = (args: string) =>
  execSync(`docker compose -p pm-e2e ${args}`, {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, APP_PORT: E2E_PORT },
    stdio: "inherit",
  });

export default function globalSetup() {
  compose("up --build --detach --wait");
  return () => compose("down --volumes");
}
