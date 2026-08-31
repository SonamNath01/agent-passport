/**
 * Proves the local half of createOrder()'s dedup logic: if a Transaction row
 * already has a razorpayOrderId for a given nonce, createOrder() returns it
 * directly and never calls the gateway. Requires a live Postgres at
 * DATABASE_URL (see docker-compose.yml); doesn't require real Razorpay
 * credentials since the fast path never reaches fetch().
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createOrder } from "../src/razorpay.js";
import { prisma } from "../src/db.js";

describe("razorpay createOrder dedup", () => {
  it("returns the existing order for a nonce that already has one, without calling the gateway", async () => {
    const userId = `user_test_${randomUUID()}`;
    const agentId = `agent_test_${randomUUID()}`;
    const mandateId = `mandate_test_${randomUUID()}`;
    const nonce = randomUUID();
    const existingOrderId = `order_test_${randomUUID()}`;

    await prisma.user.create({ data: { id: userId, name: "Test User", email: `${userId}@test.dev` } });
    await prisma.agent.create({ data: { id: agentId, userId, name: "Test Agent", publicKey: "test-key" } });
    await prisma.mandate.create({
      data: {
        id: mandateId,
        userId,
        agentId,
        maxAmountPaise: 49_900,
        currency: "INR",
        cumulativeLimitPaise: 200_000,
        windowHours: 24,
        category: "TEST",
        maxQuantity: 1,
        merchantAllowlist: ["merchant_test"],
        destination: "upi://test@bank",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        nonce: randomUUID(),
        issuerSignature: "test-signature",
      },
    });
    await prisma.transaction.create({
      data: {
        mandateId,
        agentId,
        merchantId: "merchant_test",
        category: "TEST",
        subcategory: "test",
        amountPaise: 49_900,
        quantity: 1,
        destination: "upi://test@bank",
        nonce,
        timestamp: new Date(),
        agentSignature: "test-signature",
        decision: "ALLOW",
        reasonCode: "AUTHORISED",
        razorpayOrderId: existingOrderId,
        paymentStatus: "CREATED",
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const outcome = await createOrder(nonce, 49_900, "INR");

    expect(outcome).toEqual({ status: "CREATED", orderId: existingOrderId });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
