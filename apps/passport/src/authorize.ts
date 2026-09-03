import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { CheckContext, Mandate, PaymentStatus, TransactionRequest } from "@agent-passport/shared";
import { runPipeline } from "./checks/pipeline.js";
import { prisma } from "./db.js";
import { recordAuditEvent } from "./audit.js";
import { commit, release } from "./ledger.js";
import { createOrder } from "./razorpay.js";

const MandateSchema = z.object({
  mandateId: z.string().min(1),
  userId: z.string().min(1),
  agentId: z.string().min(1),
  maxAmountPaise: z.number().int(),
  currency: z.literal("INR"),
  cumulativeLimitPaise: z.number().int(),
  windowHours: z.number().int(),
  category: z.string().min(1),
  maxQuantity: z.number().int(),
  merchantAllowlist: z.array(z.string()),
  destination: z.string().min(1),
  issuedAt: z.string(),
  expiresAt: z.string(),
  nonce: z.string(),
  issuerSignature: z.string().min(1),
});

const TransactionRequestSchema = z.object({
  mandateId: z.string().min(1),
  agentId: z.string().min(1),
  merchantId: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  amountPaise: z.number().int(),
  quantity: z.number().int(),
  destination: z.string().min(1),
  nonce: z.string(),
  timestamp: z.string(),
  agentSignature: z.string().min(1),
});

const AuthorizeBodySchema = z.object({
  mandate: MandateSchema,
  request: TransactionRequestSchema,
});

export function registerAuthorizeRoute(app: FastifyInstance, issuerPublicKey: string): void {
  app.post("/authorize", async (request, reply) => {
    const parsed = AuthorizeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_authorize_request", issues: parsed.error.issues });
    }

    const mandate = parsed.data.mandate as Mandate;
    const txRequest = parsed.data.request as TransactionRequest;

    // Check 10 creates a SpendLedger row that has a foreign key to this
    // mandate, so the mandate row must exist in the DB before the pipeline
    // runs — not just afterwards for the audit trail. Normally the issuer
    // already persisted it at issuance; this covers a mandate this passport
    // has never seen (or a tampered one that never went through the issuer).
    try {
      await ensureMandatePersisted(mandate);
    } catch (err) {
      app.log.error({ err }, "failed to persist mandate before authorize");
    }

    const ctx: CheckContext = {
      mandate,
      request: txRequest,
      issuerPublicKey,
      agentPublicKey: await lookupAgentPublicKey(txRequest.agentId),
      mandateRevoked: await lookupMandateRevoked(mandate.mandateId),
      now: Date.now(),
    };

    const result = await runPipeline(ctx);

    // Check 10 (the last check) is the only thing that ever sets
    // reservationId, and it only runs — let alone succeeds — when every
    // earlier check already passed. So reservationId implies ALLOW; the
    // BLOCK branch below is a defensive no-op under the current fixed check
    // order, kept in case that invariant ever changes.
    let payment: { status: PaymentStatus; orderId?: string } | undefined;

    if (result.decision === "ALLOW") {
      const outcome = await createOrder(txRequest.nonce, txRequest.amountPaise, mandate.currency);
      payment = outcome.status === "CREATED" ? { status: outcome.status, orderId: outcome.orderId } : { status: outcome.status };

      if (ctx.reservationId) {
        try {
          if (outcome.status === "CREATED") {
            await commit(ctx.reservationId);
          } else if (outcome.status === "FAILED") {
            await release(ctx.reservationId);
          }
          // PENDING_UNKNOWN: the gateway call timed out and we don't know
          // whether it landed, so the reservation is left held rather than
          // committed or released — no blind retry, no double-spend risk.
        } catch (err) {
          app.log.error({ err }, "failed to settle spend reservation");
        }
      }
    } else if (ctx.reservationId) {
      try {
        await release(ctx.reservationId);
      } catch (err) {
        app.log.error({ err }, "failed to settle spend reservation");
      }
    }

    // Best-effort audit trail: persistence failures must not change the
    // decision already computed above.
    try {
      await recordOutcome(mandate, txRequest, result.decision, result.reasonCode, payment);
    } catch (err) {
      app.log.error({ err }, "failed to persist authorize decision");
    }

    return reply.send({ ...result, payment });
  });
}

/** Unknown agent id or lookup failure both leave this undefined — check 01 fails closed on that. */
async function lookupAgentPublicKey(agentId: string): Promise<string | undefined> {
  try {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { publicKey: true } });
    return agent?.publicKey;
  } catch {
    return undefined;
  }
}

/** A mandate not yet seen by this passport was never revoked; a lookup failure fails closed as revoked. */
async function lookupMandateRevoked(mandateId: string): Promise<boolean> {
  try {
    const row = await prisma.mandate.findUnique({ where: { id: mandateId }, select: { revoked: true } });
    return row?.revoked ?? false;
  } catch {
    return true;
  }
}

/**
 * Creates the mandate row if this passport has never seen it, tolerating the
 * race where two concurrent first-requests for the same brand-new mandate
 * both take Prisma upsert()'s INSERT branch — one wins, the other's INSERT
 * hits the unique constraint and throws P2002, which just means the row is
 * already there.
 */
async function ensureMandatePersisted(mandate: Mandate): Promise<void> {
  try {
    await prisma.mandate.upsert({
      where: { id: mandate.mandateId },
      create: {
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
      update: {},
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return;
    }
    throw err;
  }
}

async function recordOutcome(
  mandate: Mandate,
  txRequest: TransactionRequest,
  decision: string,
  reasonCode: string,
  payment?: { status: PaymentStatus; orderId?: string },
): Promise<void> {
  await prisma.transaction.create({
    data: {
      mandateId: mandate.mandateId,
      agentId: txRequest.agentId,
      merchantId: txRequest.merchantId,
      category: txRequest.category,
      subcategory: txRequest.subcategory,
      amountPaise: txRequest.amountPaise,
      quantity: txRequest.quantity,
      destination: txRequest.destination,
      nonce: txRequest.nonce,
      timestamp: new Date(txRequest.timestamp),
      agentSignature: txRequest.agentSignature,
      decision,
      reasonCode,
      razorpayOrderId: payment?.orderId,
      paymentStatus: payment?.status,
    },
  });

  await recordAuditEvent({
    type: "authorize",
    mandateId: mandate.mandateId,
    agentId: txRequest.agentId,
    decision,
    reasonCode,
    // ALLOW carries the gateway outcome; BLOCK carries the two numbers a
    // postmortem needs and nothing else preserves together — the amount
    // actually requested and the per-transaction limit it was checked
    // against — so docs/INCIDENT.md can cite the audit row itself instead
    // of a Transaction-table join.
    detail: payment
      ? { payment }
      : decision === "BLOCK"
        ? { attemptedPaise: txRequest.amountPaise, authorisedPaise: mandate.maxAmountPaise }
        : undefined,
  });
}
