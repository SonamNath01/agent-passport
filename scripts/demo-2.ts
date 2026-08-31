/**
 * Proves the pass-2 checks end to end over HTTP: agent signature, merchant
 * allowlist, destination match, nonce replay, mandate revocation, the
 * cumulative spend cap under repeated use, and the amountPaise boundary.
 *
 * Run after `pnpm seed` with both `pnpm dev:issuer` and `pnpm dev:passport`
 * running (or their non-watch equivalents).
 */
import { randomUUID } from "node:crypto";
import { generateKeyPair, signPayload, type Mandate, type TransactionRequest } from "@agent-passport/shared";

const ISSUER_URL = process.env.ISSUER_URL ?? "http://localhost:4001";
const PASSPORT_URL = process.env.PASSPORT_URL ?? "http://localhost:4000";

const USER_ID = "user_demo";

interface MandateOverrides {
  agentId: string;
  maxAmountPaise?: number;
  cumulativeLimitPaise?: number;
  windowHours?: number;
  merchantAllowlist?: string[];
  destination?: string;
}

async function registerAgent(publicKey: string): Promise<string> {
  const res = await fetch(`${PASSPORT_URL}/agents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: USER_ID, name: "Demo-2 Agent", publicKey }),
  });

  if (!res.ok) {
    throw new Error(`passport /agents/register failed: ${res.status} ${await res.text()}`);
  }

  const { agentId } = (await res.json()) as { agentId: string };
  return agentId;
}

async function createMandate(overrides: MandateOverrides): Promise<Mandate> {
  const res = await fetch(`${ISSUER_URL}/mandates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId: USER_ID,
      agentId: overrides.agentId,
      maxAmountPaise: overrides.maxAmountPaise ?? 500_000,
      currency: "INR",
      cumulativeLimitPaise: overrides.cumulativeLimitPaise ?? 1_000_000,
      windowHours: overrides.windowHours ?? 24,
      category: "FOOTWEAR",
      maxQuantity: 1,
      merchantAllowlist: overrides.merchantAllowlist ?? ["merchant_nike", "merchant_zara"],
      destination: overrides.destination ?? "upi://merchant_nike@bank",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`issuer /mandates failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as Mandate;
}

async function revokeMandate(mandateId: string): Promise<void> {
  const res = await fetch(`${ISSUER_URL}/mandates/${mandateId}/revoke`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`issuer revoke failed: ${res.status} ${await res.text()}`);
  }
}

function signRequest(
  mandate: Mandate,
  overrides: Partial<Pick<TransactionRequest, "merchantId" | "destination" | "amountPaise" | "nonce">>,
  agentPrivateKey: string,
): TransactionRequest {
  const unsigned = {
    mandateId: mandate.mandateId,
    agentId: mandate.agentId,
    merchantId: overrides.merchantId ?? "merchant_nike",
    category: mandate.category,
    subcategory: "sneakers",
    amountPaise: overrides.amountPaise ?? mandate.maxAmountPaise,
    quantity: 1,
    destination: overrides.destination ?? mandate.destination,
    nonce: overrides.nonce ?? randomUUID(),
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

function expectResult(
  label: string,
  result: { decision: string; reasonCode: string },
  decision: string,
  reasonCode: string,
): void {
  console.log(`  -> ${result.decision} / ${result.reasonCode}`);
  if (result.decision !== decision || result.reasonCode !== reasonCode) {
    throw new Error(`${label}: expected ${decision} / ${reasonCode}, got ${result.decision} / ${result.reasonCode}`);
  }
}

async function main(): Promise<void> {
  const agentKeyPair = generateKeyPair();
  const agentId = await registerAgent(agentKeyPair.publicKey);

  console.log("=== 1. unregistered agent -> AGENT_SIGNATURE_INVALID ===");
  const strangerKeyPair = generateKeyPair();
  const mandate1 = await createMandate({ agentId });
  const strangerRequest = signRequest(mandate1, {}, strangerKeyPair.privateKey);
  expectResult("unregistered agent", await authorize(mandate1, strangerRequest), "BLOCK", "AGENT_SIGNATURE_INVALID");

  console.log("=== 2. merchant not on allowlist -> MERCHANT_NOT_ALLOWED ===");
  const mandate2 = await createMandate({ agentId });
  const badMerchantRequest = signRequest(mandate2, { merchantId: "ATTACKER_999" }, agentKeyPair.privateKey);
  expectResult("bad merchant", await authorize(mandate2, badMerchantRequest), "BLOCK", "MERCHANT_NOT_ALLOWED");

  console.log("=== 3. destination mismatch -> DESTINATION_MISMATCH ===");
  const mandate3 = await createMandate({ agentId });
  const badDestinationRequest = signRequest(mandate3, { destination: "ATTACKER_ADDR" }, agentKeyPair.privateKey);
  expectResult("bad destination", await authorize(mandate3, badDestinationRequest), "BLOCK", "DESTINATION_MISMATCH");

  console.log("=== 4. replayed nonce -> AUTHORISED then NONCE_REPLAYED ===");
  const mandate4 = await createMandate({ agentId });
  const replayRequest = signRequest(mandate4, {}, agentKeyPair.privateKey);
  expectResult("first use", await authorize(mandate4, replayRequest), "ALLOW", "AUTHORISED");
  expectResult("replay", await authorize(mandate4, replayRequest), "BLOCK", "NONCE_REPLAYED");

  console.log("=== 5. revoked mandate -> MANDATE_REVOKED ===");
  const mandate5 = await createMandate({ agentId });
  await revokeMandate(mandate5.mandateId);
  const revokedRequest = signRequest(mandate5, {}, agentKeyPair.privateKey);
  expectResult("revoked", await authorize(mandate5, revokedRequest), "BLOCK", "MANDATE_REVOKED");

  console.log("=== 6. cumulative spend cap: four ₹499 pass, fifth blocked ===");
  const mandate6 = await createMandate({
    agentId,
    maxAmountPaise: 49_900,
    cumulativeLimitPaise: 200_000, // ₹2,000
  });
  for (let i = 0; i < 4; i++) {
    const request = signRequest(mandate6, { amountPaise: 49_900 }, agentKeyPair.privateKey);
    expectResult(`spend ${i + 1}`, await authorize(mandate6, request), "ALLOW", "AUTHORISED");
  }
  const fifthRequest = signRequest(mandate6, { amountPaise: 49_900 }, agentKeyPair.privateKey);
  expectResult("spend 5", await authorize(mandate6, fifthRequest), "BLOCK", "SPEND_CAP_EXCEEDED");

  console.log("=== 7. amountPaise === maxAmountPaise -> AUTHORISED (boundary) ===");
  const mandate7 = await createMandate({ agentId });
  const boundaryRequest = signRequest(mandate7, { amountPaise: mandate7.maxAmountPaise }, agentKeyPair.privateKey);
  expectResult("boundary", await authorize(mandate7, boundaryRequest), "ALLOW", "AUTHORISED");

  console.log();
  console.log("All pass-2 demo scenarios passed.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
