import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { recordAuditEvent } from "./audit.js";

const RegisterAgentSchema = z.object({
  agentId: z.string().min(1).optional(),
  userId: z.string().min(1),
  name: z.string().min(1),
  publicKey: z.string().min(1),
});

const AgentIdParamSchema = z.object({ id: z.string().min(1) });

export function registerAgentRoutes(app: FastifyInstance): void {
  app.post("/agents/register", async (request, reply) => {
    const parsed = RegisterAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_agent_registration", issues: parsed.error.issues });
    }

    const { agentId, userId, name, publicKey } = parsed.data;

    // A caller-chosen agentId is not secret — it travels in every mandate and
    // every audit row — so re-registering one has to be immutable-key, not
    // last-write-wins. Same key back is just a harmless retry; a different
    // key is someone trying to take over an identity check 1 already trusts.
    if (agentId) {
      const existing = await prisma.agent.findUnique({ where: { id: agentId } });
      if (existing) {
        if (existing.publicKey === publicKey) {
          return reply.code(200).send({ agentId: existing.id, publicKey: existing.publicKey });
        }

        await recordAuditEvent({
          type: "agent_registration_rejected",
          agentId,
          decision: "BLOCK",
          reasonCode: "AGENT_KEY_MISMATCH",
          detail: { userId, attemptedPublicKey: publicKey, existingPublicKey: existing.publicKey },
        });
        return reply.code(409).send({ error: "agent_already_registered_with_different_key", agentId });
      }
    }

    try {
      const agent = await prisma.agent.create({ data: { id: agentId, userId, name, publicKey } });
      return reply.code(201).send({ agentId: agent.id, publicKey: agent.publicKey });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        return reply.code(400).send({ error: "unknown_user" });
      }
      throw err;
    }
  });

  app.get("/agents/:id", async (request, reply) => {
    const parsedParams = AgentIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_agent_id" });
    }
    const { id } = parsedParams.data;
    const agent = await prisma.agent.findUnique({ where: { id } });

    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }

    return reply.send(agent);
  });
}
