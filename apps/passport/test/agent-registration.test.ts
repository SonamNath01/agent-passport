/**
 * Proves agent registration keys are immutable: a fresh agentId registers,
 * re-registering the same agentId with the same key is a harmless idempotent
 * retry, and re-registering it with a different key is rejected (409) and
 * logged as a security event, leaving the original key the only one check 1
 * will accept. Requires a live Postgres at DATABASE_URL (see docker-compose.yml).
 */
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { generateKeyPair, signPayload, verifyPayload, type TransactionRequest } from "@agent-passport/shared";
import { registerAgentRoutes } from "../src/registry.js";
import { prisma } from "../src/db.js";

async function makeApp() {
  const app = Fastify();
  registerAgentRoutes(app);
  await app.ready();
  return app;
}

async function makeUser(): Promise<string> {
  const userId = `user_test_${randomUUID()}`;
  await prisma.user.create({ data: { id: userId, name: "Test User", email: `${userId}@test.dev` } });
  return userId;
}

describe("POST /agents/register", () => {
  it("registers a fresh agent", { timeout: 20_000 }, async () => {
    const app = await makeApp();
    const userId = await makeUser();
    const keyPair = generateKeyPair();

    const res = await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: { userId, name: "Test Agent", publicKey: keyPair.publicKey },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { agentId: string; publicKey: string };
    expect(body.agentId).toBeTruthy();
    expect(body.publicKey).toBe(keyPair.publicKey);

    await app.close();
  });

  it("treats re-registering the same agentId with the same key as an idempotent success", { timeout: 20_000 }, async () => {
    const app = await makeApp();
    const userId = await makeUser();
    const agentId = `agent_test_${randomUUID()}`;
    const keyPair = generateKeyPair();
    const payload = { agentId, userId, name: "Test Agent", publicKey: keyPair.publicKey };

    const first = await app.inject({ method: "POST", url: "/agents/register", payload });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: "POST", url: "/agents/register", payload });
    expect(second.statusCode).toBe(200);
    expect((second.json() as { publicKey: string }).publicKey).toBe(keyPair.publicKey);

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(agent?.publicKey).toBe(keyPair.publicKey);

    await app.close();
  });

  it("rejects re-registering an existing agentId with a different key and audits it", { timeout: 20_000 }, async () => {
    const app = await makeApp();
    const userId = await makeUser();
    const agentId = `agent_test_${randomUUID()}`;
    const originalKeyPair = generateKeyPair();
    const attackerKeyPair = generateKeyPair();

    const first = await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: { agentId, userId, name: "Test Agent", publicKey: originalKeyPair.publicKey },
    });
    expect(first.statusCode).toBe(201);

    const attempt = await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: { agentId, userId, name: "Test Agent", publicKey: attackerKeyPair.publicKey },
    });
    expect(attempt.statusCode).toBe(409);
    expect((attempt.json() as { error: string }).error).toBe("agent_already_registered_with_different_key");

    const auditRows = await prisma.auditEvent.findMany({
      where: { type: "agent_registration_rejected", agentId },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].reasonCode).toBe("AGENT_KEY_MISMATCH");

    await app.close();
  });

  it("still verifies check 1 against the original key after a rejected re-registration attempt", { timeout: 20_000 }, async () => {
    const app = await makeApp();
    const userId = await makeUser();
    const agentId = `agent_test_${randomUUID()}`;
    const originalKeyPair = generateKeyPair();
    const attackerKeyPair = generateKeyPair();

    await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: { agentId, userId, name: "Test Agent", publicKey: originalKeyPair.publicKey },
    });
    await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: { agentId, userId, name: "Test Agent", publicKey: attackerKeyPair.publicKey },
    });

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    expect(agent?.publicKey).toBe(originalKeyPair.publicKey);

    const unsigned = {
      mandateId: `mandate_test_${randomUUID()}`,
      agentId,
      merchantId: "merchant_test",
      category: "TEST",
      subcategory: "test",
      amountPaise: 1_000,
      quantity: 1,
      destination: "upi://test@bank",
      nonce: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // A request signed with the attacker's key must fail against the
    // registered (original) public key — the takeover attempt bought nothing.
    const attackerSigned: TransactionRequest = {
      ...unsigned,
      agentSignature: signPayload(
        { ...unsigned, agentSignature: "" } as TransactionRequest,
        "agentSignature",
        attackerKeyPair.privateKey,
      ),
    };
    expect(verifyPayload(attackerSigned, "agentSignature", agent!.publicKey)).toBe(false);

    // A request signed with the original key still verifies fine.
    const originalSigned: TransactionRequest = {
      ...unsigned,
      agentSignature: signPayload(
        { ...unsigned, agentSignature: "" } as TransactionRequest,
        "agentSignature",
        originalKeyPair.privateKey,
      ),
    };
    expect(verifyPayload(originalSigned, "agentSignature", agent!.publicKey)).toBe(true);

    await app.close();
  });
});
