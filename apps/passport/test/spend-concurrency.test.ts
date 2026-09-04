/**
 * Proves check 10's cap enforcement holds under real concurrency: five
 * ₹499 authorize calls fired in parallel against a fresh ₹2,000 cap must
 * yield exactly four ALLOW and one SPEND_CAP_EXCEEDED, never five ALLOWs.
 * Requires a live Postgres at DATABASE_URL (see docker-compose.yml).
 */
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { generateKeyPair, signPayload, type Mandate, type TransactionRequest } from "@agent-passport/shared";
import { registerAuthorizeRoute } from "../src/authorize.js";
import { prisma } from "../src/db.js";

describe("spend cap under concurrency", () => {
  // Each authorize call makes several sequential DB round trips (agent lookup,
  // revoked lookup, nonce insert, spend reservation, mandate/transaction/audit
  // writes); over Docker Desktop's WSL2 network layer that comfortably exceeds
  // vitest's default 5s timeout even though nothing is actually stuck.
  it("allows exactly four ₹499 authorize requests against a ₹2,000 cap and blocks the fifth", { timeout: 120_000 }, async () => {
    const issuerKeyPair = generateKeyPair();
    const agentKeyPair = generateKeyPair();

    const app = Fastify();
    registerAuthorizeRoute(app, issuerKeyPair.publicKey);
    await app.ready();

    const userId = `user_test_${randomUUID()}`;
    const agentId = `agent_test_${randomUUID()}`;
    await prisma.user.create({ data: { id: userId, name: "Test User", email: `${userId}@test.dev` } });
    await prisma.agent.create({
      data: { id: agentId, userId, name: "Test Agent", publicKey: agentKeyPair.publicKey },
    });

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
      issuerSignature: signPayload(
        { ...unsignedMandate, issuerSignature: "" } as Mandate,
        "issuerSignature",
        issuerKeyPair.privateKey,
      ),
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
        agentSignature: signPayload(
          { ...unsigned, agentSignature: "" } as TransactionRequest,
          "agentSignature",
          agentKeyPair.privateKey,
        ),
      };
    }

    const requests = Array.from({ length: 5 }, () => signRequest());

    const responses = await Promise.all(
      requests.map((request) => app.inject({ method: "POST", url: "/authorize", payload: { mandate, request } })),
    );

    const decisions = responses.map((res) => res.json() as { decision: string; reasonCode: string });
    const allowed = decisions.filter((d) => d.decision === "ALLOW" && d.reasonCode === "AUTHORISED");
    const blocked = decisions.filter((d) => d.decision === "BLOCK" && d.reasonCode === "SPEND_CAP_EXCEEDED");

    expect(allowed).toHaveLength(4);
    expect(blocked).toHaveLength(1);

    await app.close();
  });
});
