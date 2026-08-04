import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installService, previewChanges, removeService, startService, stopService } from "../packages/sdk/src/machine";

const directory = await mkdtemp(join(tmpdir(), "tokly-service-smoke-"));
process.env.TOKLY_HOME = directory;
process.env.TOKLY_SERVICE_DRY_RUN = "1";

try {
  const serviceLine = previewChanges(["codex"], 4318).find((line) => line.startsWith("Login service: "));
  if (!serviceLine) throw new Error("Service preview missing.");
  const path = serviceLine.slice("Login service: ".length);
  await installService("/isolated/tokly/dist/cli.js");
  await access(path);
  if (!startService() || !stopService()) throw new Error("Dry-run service lifecycle failed.");
  await removeService();
  try { await access(path); throw new Error("Service manifest was not removed."); } catch (error) { if (error instanceof Error && error.message === "Service manifest was not removed.") throw error; }
  console.log(`Tokly ${process.platform} service lifecycle smoke test passed.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
