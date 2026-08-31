/**
 * Proves the pass-1 pipeline end to end over HTTP, playing the role the agent
 * service will take over in pass-2: it holds its own keypair, signs a
 * TransactionRequest, and calls the Passport directly.
 *
 * Run after `pnpm seed` with both `pnpm dev:issuer` and `pnpm dev:passport`
 * running (or use their non-watch equivalents).
 */
import { randomUUID } from "node:crypto";
import { generateKeyPair, signPayload, type Mandate, type TransactionRequest } from "@agent-passport/shared";

const ISSUER_URL = process.env.ISSUER_URL ?? "http://localhost:4001";
const PASSPORT_URL = process.env.PASSPORT_URL ?? "http://localhost:4000";

const USER_ID = "user_demo";

async function registerAgent(publicKey: string): Promise<string> {
  const res = await fetch(`${PASSPORT_URL}/agents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: USER_ID, name: "Demo Agent (scripted)", publicKey }),
  });

  if (!res.ok) {
    throw new Error(`passport /agents/register failed: ${res.status} ${await res.text()}`);
  }

  const { agentId } = (await res.json()) as { agentId: string };
  return agentId;
}

async function createMandate(agentId: string): Promise<Mandate> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(`${ISSUER_URL}/mandates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: USER_ID,
      agentId,
      maxAmountPaise: 500_000, // ₹5,000
      currency: "INR",
      cumulativeLimitPaise: 1_000_000,
      windowHours: 24,
      category: "FOOTWEAR",
      maxQuantity: 1,
      merchantAllowlist: ["merchant_nike", "merchant_zara"],
      destination: "upi://merchant_nike@bank",
      expiresAt,
    }),
  });

  if (!res.ok) {
    throw new Error(`issuer /mandates failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as Mandate;
}

function signRequest(
  mandate: Mandate,
  amountPaise: number,
  agentPrivateKey: string,
): TransactionRequest {
  const unsigned = {
    mandateId: mandate.mandateId,
    agentId: mandate.agentId,
    merchantId: "merchant_nike",
    category: mandate.category,
    subcategory: "sneakers",
    amountPaise,
    quantity: 1,
    destination: mandate.destination,
    nonce: randomUUID(),
    timestamp: new Date().toISOString(),
  };

  const agentSignature = signPayload(
    { ...unsigned, agentSignature: "" } as TransactionRequest,
    "agentSignature",
    agentPrivateKey,
  );

  return { ...unsigned, agentSignature };
}

async function authorize(mandate: Mandate, request: TransactionRequest) {
  const res = await fetch(`${PASSPORT_URL}/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mandate, request }),
  });

  return (await res.json()) as { decision: string; reasonCode: string };
}

async function main(): Promise<void> {
  // The demo generates its own agent keypair and registers it with the
  // passport rather than reusing the seeded one (seed.ts only prints its
  // private key to the console). Check 01 verifies this signature for real
  // as of pass-2, so the key used here must actually be registered.
  const agentKeyPair = generateKeyPair();
  const agentId = await registerAgent(agentKeyPair.publicKey);

  console.log("=== Scenario 1: within limits -> ALLOW ===");
  const mandate1 = await createMandate(agentId);
  const allowRequest = signRequest(mandate1, 450_000, agentKeyPair.privateKey); // ₹4,500
  const allowResult = await authorize(mandate1, allowRequest);
  console.log(`  -> ${allowResult.decision} / ${allowResult.reasonCode}`);
  if (allowResult.decision !== "ALLOW" || allowResult.reasonCode !== "AUTHORISED") {
    throw new Error("expected ALLOW / AUTHORISED");
  }

  console.log("=== Scenario 2: over the mandate cap -> BLOCK ===");
  const mandate2 = await createMandate(agentId);
  const blockRequest = signRequest(mandate2, 2_000_000, agentKeyPair.privateKey); // ₹20,000
  const blockResult = await authorize(mandate2, blockRequest);
  console.log(`  -> ${blockResult.decision} / ${blockResult.reasonCode}`);
  if (blockResult.decision !== "BLOCK" || blockResult.reasonCode !== "PRICE_LIMIT_EXCEEDED") {
    throw new Error("expected BLOCK / PRICE_LIMIT_EXCEEDED");
  }

  console.log("=== Scenario 3: tampered mandate -> BLOCK ===");
  const mandate3 = await createMandate(agentId);
  const tamperedMandate: Mandate = { ...mandate3, maxAmountPaise: mandate3.maxAmountPaise * 100 };
  const tamperedRequest = signRequest(tamperedMandate, 450_000, agentKeyPair.privateKey);
  const tamperedResult = await authorize(tamperedMandate, tamperedRequest);
  console.log(`  -> ${tamperedResult.decision} / ${tamperedResult.reasonCode}`);
  if (tamperedResult.decision !== "BLOCK" || tamperedResult.reasonCode !== "MANDATE_SIGNATURE_INVALID") {
    throw new Error("expected BLOCK / MANDATE_SIGNATURE_INVALID");
  }

  console.log();
  console.log("All demo scenarios passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
