import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db.js";

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export interface AuditEventInput {
  type: string;
  mandateId?: string;
  agentId?: string;
  decision?: string;
  reasonCode?: string;
  detail?: Record<string, unknown>;
}

export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      type: event.type,
      mandateId: event.mandateId,
      agentId: event.agentId,
      decision: event.decision,
      reasonCode: event.reasonCode,
      detail: event.detail as Prisma.InputJsonValue | undefined,
    },
  });
}

export function registerAuditRoutes(app: FastifyInstance): void {
  app.get("/audit", async (request, reply) => {
    const parsed = AuditQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_audit_query", issues: parsed.error.issues });
    }

    const events = await prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
    });

    return { events };
  });
}
