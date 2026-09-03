/**
 * The full policy matrix: thirteen cases from CLAUDE.md's phase-5 prompt plus
 * one more added when check 11 (mandate-agent binding) was found missing and
 * fixed, each driving the eleven-check pipeline directly (no HTTP, no
 * gateway) so every case proves exactly one check's verdict. A single
 * well-formed baseline mandate + request is built per test and exactly one
 * field is mutated, so a pass here means that specific check — not an
 * earlier one — produced the reason code. Checks 9 and 10 touch Postgres
 * (and case 14, run last in the pipeline, needs the mandate persisted to get
 * that far); every other case is pure signature/field comparison and needs
 * no DB row at all.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateKeyPair,
  signPayload,
  ReasonCode,
  type Mandate,
  type TransactionRequest,
  type UnsignedMandate,
  type UnsignedTransactionRequest,
  type CheckContext,
} from "@agent-passport/shared";
import { runPipeline } from "../apps/passport/src/checks/pipeline.js";
import { prisma } from "../apps/passport/src/db.js";

function makeMandate(issuerPrivateKey: string, overrides: Partial<UnsignedMandate> = {}): Mandate {
  const unsigned: UnsignedMandate = {
    mandateId: `mandate_test_${randomUUID()}`,
    userId: `user_test_${randomUUID()}`,
    agentId: `agent_test_${randomUUID()}`,
    maxAmountPaise: 100_000, // ₹1,000
    currency: "INR",
    cumulativeLimitPaise: 500_000, // ₹5,000 — plenty of headroom unless a case overrides it
    windowHours: 24,
    category: "FOOTWEAR",
    maxQuantity: 2,
    merchantAllowlist: ["merchant_nike"],
    destination: "upi://merchant_nike@bank",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    nonce: randomUUID(),
    ...overrides,
  };
  const issuerSignature = signPayload({ ...unsigned, issuerSignature: "" } as Mandate, "issuerSignature", issuerPrivateKey);
  return { ...unsigned, issuerSignature };
}

function makeRequest(
  mandate: Mandate,
  agentPrivateKey: string,
  overrides: Partial<UnsignedTransactionRequest> = {},
): TransactionRequest {
  const unsigned: UnsignedTransactionRequest = {
    mandateId: mandate.mandateId,
    agentId: mandate.agentId,
    merchantId: "merchant_nike",
    category: mandate.category,
    subcategory: "running shoes",
    amountPaise: 50_000, // ₹500 — well under the ₹1,000 baseline limit
    quantity: 1,
    destination: mandate.destination,
    nonce: randomUUID(),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
  const agentSignature = signPayload({ ...unsigned, agentSignature: "" } as TransactionRequest, "agentSignature", agentPrivateKey);
  return { ...unsigned, agentSignature };
}

function baseCtx(
  mandate: Mandate,
  request: TransactionRequest,
  issuerPublicKey: string,
  agentPublicKey: string,
  extra: Partial<CheckContext> = {},
): CheckContext {
  return { mandate, request, issuerPublicKey, agentPublicKey, mandateRevoked: false, now: Date.now(), ...extra };
}

/** Checks 09/10 need the mandate's own row to exist (spend_ledgers has a real FK to mandates). */
async function persistMandate(mandate: Mandate, agentPublicKey: string): Promise<void> {
  await prisma.user.create({ data: { id: mandate.userId, name: "Test User", email: `${mandate.userId}@test.dev` } });
  await prisma.agent.create({ data: { id: mandate.agentId, userId: mandate.userId, name: "Test Agent", publicKey: agentPublicKey } });
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
}

describe("policy matrix", () => {
  it("1. blocks an amount over the per-transaction limit", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey, { amountPaise: mandate.maxAmountPaise + 1 });
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.PRICE_LIMIT_EXCEEDED);
  });

  it("2. blocks a merchant not in the allow-list", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey, { merchantId: "merchant_evil" });
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.MERCHANT_NOT_ALLOWED);
  });

  it("3. blocks a destination that doesn't match the mandate", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey, { destination: "upi://attacker@bank" });
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.DESTINATION_MISMATCH);
  });

  it("4. blocks an expired mandate", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey, { expiresAt: new Date(Date.now() - 3_600_000).toISOString() });
    const request = makeRequest(mandate, agent.privateKey);
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.MANDATE_EXPIRED);
  });

  it("5. blocks a revoked mandate", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey);
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey, { mandateRevoked: true }));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.MANDATE_REVOKED);
  });

  it("6. blocks a mandate signed by a key other than the trusted issuer's (forged)", async () => {
    const issuer = generateKeyPair();
    const rogueIssuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(rogueIssuer.privateKey); // signed by an attacker, not the trusted issuer
    const request = makeRequest(mandate, agent.privateKey);
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.MANDATE_SIGNATURE_INVALID);
  });

  it("7. blocks a request signed by a key other than the registered agent's", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const rogueAgent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, rogueAgent.privateKey); // wrong signer
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.AGENT_SIGNATURE_INVALID);
  });

  it("8. blocks a replayed nonce", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey);
    await prisma.usedNonce.create({ data: { nonce: request.nonce, mandateId: mandate.mandateId, agentId: request.agentId } });
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.NONCE_REPLAYED);
  });

  it("9. blocks a request that would exceed the cumulative cap", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey, { cumulativeLimitPaise: 40_000 }); // below the ₹500 request below
    const request = makeRequest(mandate, agent.privateKey); // amountPaise 50_000 <= maxAmountPaise but > cap
    await persistMandate(mandate, agent.publicKey);
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.SPEND_CAP_EXCEEDED);
  });

  it("10. blocks a quantity over the mandate's max", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey, { quantity: mandate.maxQuantity + 1 });
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.QUANTITY_EXCEEDED);
  });

  it("11. blocks a category that doesn't match the mandate", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey, { category: "ELECTRONICS" });
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.CATEGORY_MISMATCH);
  });

  it("12. allows a fully valid transaction", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey);
    await persistMandate(mandate, agent.publicKey);
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.AUTHORISED);
  });

  it("13. allows a transaction exactly at the per-transaction limit (boundary, no off-by-one)", async () => {
    const issuer = generateKeyPair();
    const agent = generateKeyPair();
    const mandate = makeMandate(issuer.privateKey);
    const request = makeRequest(mandate, agent.privateKey, { amountPaise: mandate.maxAmountPaise });
    await persistMandate(mandate, agent.publicKey);
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agent.publicKey));
    expect(result.decision).toBe("ALLOW");
    expect(result.reasonCode).toBe(ReasonCode.AUTHORISED);
  });

  it("14. blocks a genuine agent B presenting agent A's mandate with agent B's own valid signature", async () => {
    const issuer = generateKeyPair();
    const agentA = generateKeyPair();
    const agentB = generateKeyPair();
    // The mandate is issued to A. Every field of the request otherwise
    // satisfies it — merchant, category, quantity, amount, destination all
    // pass — but it's signed and presented by B, a different, genuinely
    // registered agent with its own real key. Nothing here is forged.
    const agentAId = `agent_test_${randomUUID()}`;
    const agentBId = `agent_test_${randomUUID()}`;
    const mandate = makeMandate(issuer.privateKey, { agentId: agentAId });
    const request = makeRequest(mandate, agentB.privateKey, { agentId: agentBId });
    await persistMandate(mandate, agentA.publicKey);
    const result = await runPipeline(baseCtx(mandate, request, issuer.publicKey, agentB.publicKey));

    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCode).toBe(ReasonCode.MANDATE_AGENT_MISMATCH);

    // Checks 1-10 all actually ran and passed — this isn't short-circuiting
    // on a forged signature or a bad amount, it's specifically the mandate/
    // agent binding, and only the binding, that catches this.
    expect(result.checks).toHaveLength(11);
    for (const c of result.checks.slice(0, 10)) {
      expect(c.result.ok, `check ${c.id} (${c.name}) should have passed`).toBe(true);
    }
    expect(result.checks[10].id).toBe(11);
    expect(result.checks[10].name).toBe("mandate-agent");
    expect(result.checks[10].result).toEqual({ ok: false, code: ReasonCode.MANDATE_AGENT_MISMATCH });
  });
});
