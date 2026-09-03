import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { signPayload, type Mandate, type KeyPairBase64 } from "@agent-passport/shared";
import { prisma } from "./db.js";

// Deliberately not zod's built-in `.datetime()` helper: its exact shape has
// shifted across zod major versions, and ISO-8601-with-offset is easy enough
// to check directly without depending on that surface.
const isoDateTimeWithOffset = z
  .string()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
    { message: "must be an ISO 8601 timestamp with an explicit offset (or Z)" },
  );

const CreateMandateSchema = z.object({
  userId: z.string().min(1),
  agentId: z.string().min(1),
  maxAmountPaise: z.number().int().positive(),
  currency: z.literal("INR"),
  cumulativeLimitPaise: z.number().int().positive(),
  windowHours: z.number().int().positive(),
  category: z.string().min(1),
  maxQuantity: z.number().int().positive(),
  merchantAllowlist: z.array(z.string().min(1)).min(1),
  destination: z.string().min(1),
  expiresAt: isoDateTimeWithOffset,
});

const MandateIdParamSchema = z.object({ id: z.string().min(1) });

export function registerMandateRoutes(app: FastifyInstance, keyPair: KeyPairBase64): void {
  app.post("/mandates", async (request, reply) => {
    const parsed = CreateMandateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_mandate_request", issues: parsed.error.issues });
    }

    const unsigned = {
      ...parsed.data,
      mandateId: `mandate_${randomUUID()}`,
      issuedAt: new Date().toISOString(),
      nonce: randomUUID(),
    };

    const issuerSignature = signPayload(
      { ...unsigned, issuerSignature: "" } as Mandate,
      "issuerSignature",
      keyPair.privateKey,
    );

    const mandate: Mandate = { ...unsigned, issuerSignature };

    // Persisted at issuance, not lazily on first authorize call, so a mandate
    // can be revoked by id even before an agent ever presents it.
    try {
      await prisma.mandate.create({
        data: {
          id: mandate.mandateId,
          userId: mandate.userId,
          agentId: mandate.agentId,
          maxAmountPaise: mandate.maxAmountPaise,
          currency: mandate.currency,
          cumulativeLimitPaise: mandate.cumulativeLimitPaise,
          windowHours: mandate.windowHours,
          category: mandate.category,
          maxQuantity: mandate.maxQuantity,
          merchantAllowlist: mandate.merchantAllowlist,
          destination: mandate.destination,
          issuedAt: new Date(mandate.issuedAt),
          expiresAt: new Date(mandate.expiresAt),
          nonce: mandate.nonce,
          issuerSignature: mandate.issuerSignature,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        return reply.code(400).send({ error: "unknown_user_or_agent" });
      }
      throw err;
    }

    return reply.code(201).send(mandate);
  });

  app.get("/mandates/:id", async (request, reply) => {
    const parsedParams = MandateIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_mandate_id" });
    }
    const { id } = parsedParams.data;
    const row = await prisma.mandate.findUnique({ where: { id } });
    if (!row) {
      return reply.code(404).send({ error: "mandate_not_found" });
    }

    // Reconstructs the exact object that was signed at issuance — same
    // field values, same ISO string shape (issuedAt/expiresAt were signed
    // as new Date().toISOString(), which round-trips losslessly through
    // Postgres) — so callers can still verify issuerSignature against it.
    const mandate: Mandate = {
      mandateId: row.id,
      userId: row.userId,
      agentId: row.agentId,
      maxAmountPaise: row.maxAmountPaise,
      currency: row.currency as Mandate["currency"],
      cumulativeLimitPaise: row.cumulativeLimitPaise,
      windowHours: row.windowHours,
      category: row.category,
      maxQuantity: row.maxQuantity,
      merchantAllowlist: row.merchantAllowlist,
      destination: row.destination,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      nonce: row.nonce,
      issuerSignature: row.issuerSignature,
    };

    return reply.send(mandate);
  });

  app.post("/mandates/:id/revoke", async (request, reply) => {
    const parsedParams = MandateIdParamSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_mandate_id" });
    }
    const { id } = parsedParams.data;

    try {
      const mandate = await prisma.mandate.update({
        where: { id },
        data: { revoked: true },
      });
      return reply.send({ mandateId: mandate.id, revoked: mandate.revoked });
    } catch {
      return reply.code(404).send({ error: "mandate_not_found" });
    }
  });
}
