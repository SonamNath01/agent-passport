import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";

const MandateIdParamSchema = z.object({ id: z.string().min(1) });

/**
 * Read-only view of one mandate's cumulative-spend ledger, for the web
 * dashboard's spent/reserved/remaining bar (screen 3). Nothing here decides
 * a payment — check 10 in apps/passport/src/checks/10-spend.ts is still the
 * only place that does that; this just exposes what it already wrote.
 */
export function registerMandateStatusRoute(app: FastifyInstance): void {
  app.get("/mandates/:id/status", async (request, reply) => {
    const parsedParams = MandateIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_mandate_id" });
    }
    const { id } = parsedParams.data;

    const mandate = await prisma.mandate.findUnique({
      where: { id },
      select: { agentId: true, cumulativeLimitPaise: true },
    });
    if (!mandate) {
      return reply.code(404).send({ error: "mandate_not_found" });
    }

    const ledger = await prisma.spendLedger.findUnique({ where: { mandateId: id } });
    const spentPaise = ledger?.spentPaise ?? 0;
    const reservedPaise = ledger?.reservedPaise ?? 0;

    return reply.send({
      mandateId: id,
      agentId: mandate.agentId,
      capPaise: mandate.cumulativeLimitPaise,
      spentPaise,
      reservedPaise,
      remainingPaise: mandate.cumulativeLimitPaise - spentPaise - reservedPaise,
    });
  });
}
