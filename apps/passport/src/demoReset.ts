import type { FastifyInstance } from "fastify";
import { prisma } from "./db.js";

/**
 * Backs the web demo panel's "reset" control. Clears every mandate-scoped
 * table (children before parents, same order as scripts/demo-reset.ts) but
 * deliberately leaves Agent and User rows alone — unlike that script, which
 * wipes them too and then requires every service to restart so apps/agent
 * can re-register a fresh identity. A recording session needs to re-run the
 * five scenarios back to back without bouncing the already-running agent
 * service, so this is the narrower, service-safe equivalent.
 */
export function registerDemoResetRoute(app: FastifyInstance): void {
  app.post("/demo/reset", async () => {
    await prisma.transaction.deleteMany();
    await prisma.reservation.deleteMany();
    await prisma.spendLedger.deleteMany();
    await prisma.usedNonce.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.mandate.deleteMany();
    return { reset: true };
  });
}
