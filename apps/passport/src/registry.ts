import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";

const RegisterAgentSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  publicKey: z.string().min(1),
});

export function registerAgentRoutes(app: FastifyInstance): void {
  app.post("/agents/register", async (request, reply) => {
    const parsed = RegisterAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_agent_registration", issues: parsed.error.issues });
    }

    const agent = await prisma.agent.create({ data: parsed.data });

    return reply.code(201).send({ agentId: agent.id, publicKey: agent.publicKey });
  });

  app.get("/agents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await prisma.agent.findUnique({ where: { id } });

    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }

    return reply.send(agent);
  });
}
