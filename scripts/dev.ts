import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const dockerDesktopPath = "/opt/docker-desktop/bin/docker-desktop";

function dockerIsReady() {
  return spawnSync("docker", ["info"], {
    stdio: "ignore",
    timeout: 5_000,
  }).status === 0;
}

function startDockerDesktop() {
  if (process.platform === "darwin") {
    const child = spawn("open", ["-a", "Docker"], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }

  if (process.platform === "linux") {
    const service = spawnSync("systemctl", ["--user", "start", "docker-desktop"], {
      stdio: "ignore",
    });
    if (service.status === 0) return;

    if (existsSync(dockerDesktopPath)) {
      const child = spawn(dockerDesktopPath, [], { detached: true, stdio: "ignore" });
      child.unref();
      return;
    }
  }

  throw new Error("Docker Desktop is not running and could not be started automatically.");
}

async function ensureDockerIsReady() {
  if (dockerIsReady()) return;

  console.log("Starting Docker Desktop…");
  startDockerDesktop();

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (dockerIsReady()) return;
  }

  throw new Error("Docker Desktop did not become ready within 90 seconds.");
}

async function main() {
  await ensureDockerIsReady();

  console.log("Starting the Tokly PostgreSQL service…");
  const compose = spawnSync("docker", ["compose", "up", "-d", "--wait", "postgres"], {
    stdio: "inherit",
  });
  if (compose.status !== 0) process.exit(compose.status ?? 1);

  const next = spawn("next", ["dev", ...process.argv.slice(2)], { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => next.kill(signal));
  }
  next.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Could not start the development environment: ${message}`);
  process.exit(1);
});
