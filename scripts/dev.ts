/**
 * Starts all four services for local dev: issuer, passport, agent, and the
 * web app. Plain Node child_process, not a bash script or a new dependency
 * like `concurrently` — just spawns each `pnpm --filter <pkg> dev`, prefixes
 * its output, and kills every child when one dies or on Ctrl-C.
 */
import { spawn, type ChildProcess } from "node:child_process";

interface ServiceSpec {
  label: string;
  filter: string;
}

const services: ServiceSpec[] = [
  { label: "issuer", filter: "@agent-passport/issuer" },
  { label: "passport", filter: "@agent-passport/passport" },
  { label: "agent", filter: "@agent-passport/agent" },
  { label: "web", filter: "@agent-passport/web" },
];

const children: ChildProcess[] = [];
let shuttingDown = false;

function prefix(label: string, chunk: Buffer): string {
  return chunk
    .toString()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => `[${label}] ${line}`)
    .join("\n");
}

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(code);
}

for (const service of services) {
  const child = spawn("pnpm", ["--filter", service.filter, "dev"], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);

  child.stdout.on("data", (chunk: Buffer) => console.log(prefix(service.label, chunk)));
  child.stderr.on("data", (chunk: Buffer) => console.error(prefix(service.label, chunk)));
  child.on("exit", (code) => {
    console.error(`[${service.label}] exited with code ${code}`);
    shutdown(code ?? 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
