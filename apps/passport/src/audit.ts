import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

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
  app.get("/audit", async (request) => {
    const { limit } = request.query as { limit?: string };
    const take = Math.min(Math.max(Number(limit ?? 50) || 50, 1), 200);

    const events = await prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });

    return { events };
  });
}
