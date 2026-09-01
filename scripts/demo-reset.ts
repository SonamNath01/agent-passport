// Clears every row from every table (children before parents, to satisfy
// foreign keys) so a recording session always starts from an empty database.
// Also drops the agent's persisted identity file: apps/agent caches its
// registered agentId in .keys/agent.json, and that id no longer exists once
// the Agent table is cleared, so it must re-register on the next restart.
// Run via `pnpm demo:reset`, which chains this with `pnpm seed` afterwards —
// restart apps/agent (and every other service) after running it.
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_IDENTITY_FILE = join(__dirname, "..", ".keys", "agent.json");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  await prisma.transaction.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.spendLedger.deleteMany();
  await prisma.usedNonce.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.mandate.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.user.deleteMany();
  console.log("All tables cleared.");

  if (existsSync(AGENT_IDENTITY_FILE)) {
    rmSync(AGENT_IDENTITY_FILE);
    console.log("Removed .keys/agent.json — restart apps/agent to re-register.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
