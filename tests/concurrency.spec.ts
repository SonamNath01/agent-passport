/**
 * Extends the phase-2 spend-race proof (apps/passport/test/spend-concurrency.test.ts)
 * to run the same race ten times in a row against ten independent mandates, not once.
 * Each round fires five parallel ₹499 authorize calls at a fresh ₹2,000 cap over the
 * real /authorize HTTP route and must land exactly four ALLOW and one
 * SPEND_CAP_EXCEEDED — proving check 10's atomic reserve() holds under concurrency
 * consistently, not just on a lucky run.
 */
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { generateKeyPair, signPayload, type Mandate, type TransactionRequest } from "@agent-passport/shared";
import { registerAuthorizeRoute } from "../apps/passport/src/authorize.js";
import { prisma } from "../apps/passport/src/db.js";

async function runOneRace(
  app: ReturnType<typeof Fastify>,
  issuerKeyPair: { publicKey: string; privateKey: string },
): Promise<{ allowed: number; blocked: number }> {
  const agentKeyPair = generateKeyPair();

  const userId = `user_test_${randomUUID()}`;
  const agentId = `agent_test_${randomUUID()}`;
  await prisma.user.create({ data: { id: userId, name: "Test User", email: `${userId}@test.dev` } });
  await prisma.agent.create({ data: { id: agentId, userId, name: "Test Agent", publicKey: agentKeyPair.publicKey } });

  const unsignedMandate = {
    mandateId: `mandate_test_${randomUUID()}`,
    userId,
    agentId,
    maxAmountPaise: 49_900, // ₹499
    currency: "INR" as const,
    cumulativeLimitPaise: 200_000, // ₹2,000
    windowHours: 24,
    category: "TEST",
    maxQuantity: 5,
    merchantAllowlist: ["merchant_test"],
    destination: "upi://test@bank",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    nonce: randomUUID(),
  };
  const mandate: Mandate = {
    ...unsignedMandate,
    issuerSignature: signPayload({ ...unsignedMandate, issuerSignature: "" } as Mandate, "issuerSignature", issuerKeyPair.privateKey),
  };

  function signRequest(): TransactionRequest {
    const unsigned = {
      mandateId: mandate.mandateId,
      agentId,
      merchantId: "merchant_test",
      category: mandate.category,
      subcategory: "test",
      amountPaise: 49_900,
      quantity: 1,
      destination: mandate.destination,
      nonce: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    return {
      ...unsigned,
      agentSignature: signPayload({ ...unsigned, agentSignature: "" } as TransactionRequest, "agentSignature", agentKeyPair.privateKey),
    };
  }

  const requests = Array.from({ length: 5 }, () => signRequest());
  const responses = await Promise.all(
    requests.map((request) => app.inject({ method: "POST", url: "/authorize", payload: { mandate, request } })),
  );
  const decisions = responses.map((res) => res.json() as { decision: string; reasonCode: string });

  return {
    allowed: decisions.filter((d) => d.decision === "ALLOW" && d.reasonCode === "AUTHORISED").length,
    blocked: decisions.filter((d) => d.decision === "BLOCK" && d.reasonCode === "SPEND_CAP_EXCEEDED").length,
  };
}

describe("spend cap under concurrency, repeated", () => {
  it(
    "allows exactly four of five parallel ₹499 requests against a ₹2,000 cap, ten rounds in a row",
    { timeout: 120_000 },
    async () => {
      const issuerKeyPair = generateKeyPair();
      const app = Fastify();
      registerAuthorizeRoute(app, issuerKeyPair.publicKey);
      await app.ready();

      for (let round = 1; round <= 10; round++) {
        const { allowed, blocked } = await runOneRace(app, issuerKeyPair);
        expect(allowed, `round ${round}: allowed count`).toBe(4);
        expect(blocked, `round ${round}: blocked count`).toBe(1);
      }

      await app.close();
    },
  );
});
