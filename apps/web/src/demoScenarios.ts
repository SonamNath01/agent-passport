import type { Mandate } from "@agent-passport/shared";
import { authorizeDirect, createMandate, getMandateStatus, runAgent } from "./api";
import type { MandateStatus, RunResponse } from "./types";

// Same defaults scripts/demo.ts and CreateMandate.tsx already use, so a
// scenario's mandate looks like any other mandate in this demo, not a
// special case. The prompt is fixed (not the user's editable field on the
// other two screens) so every scenario is deterministic: the scripted
// brain always picks prod_001, "Everyday Running Shoes", ₹4,500.
const USER_ID = "user_demo";
const MERCHANT_ALLOWLIST = ["merchant_nike", "merchant_zara"];
const DESTINATION = "upi://merchant_nike@bank";
const CATEGORY = "FOOTWEAR";
const WINDOW_HOURS = 24;
export const DEMO_PROMPT = "Find me running shoes, my budget is ₹5000";

const CHEAPEST_PRODUCT_PAISE = 450_000; // prod_001, ₹4,500 — see data/catalog.clean.json

function expiresAt(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

async function freshMandate(agentId: string, overrides: Partial<Parameters<typeof createMandate>[0]> = {}): Promise<Mandate> {
  return createMandate({
    userId: USER_ID,
    agentId,
    maxAmountPaise: 500_000, // ₹5,000
    currency: "INR",
    cumulativeLimitPaise: 2_000_000,
    windowHours: WINDOW_HOURS,
    category: CATEGORY,
    maxQuantity: 1,
    merchantAllowlist: MERCHANT_ALLOWLIST,
    destination: DESTINATION,
    expiresAt: expiresAt(),
    ...overrides,
  });
}

export interface ScenarioOutcome {
  label: string;
  expected: string;
  /** decision/reasonCode a passing run must land on — lets the panel show a real match/mismatch, not just echo the result. */
  expectedDecision: string;
  expectedReasonCode: string;
  mandate: Mandate;
  run: RunResponse;
  note?: string;
}

/** Scenario 1 — a normal, in-budget purchase. Expect ALLOW / AUTHORISED and a real Razorpay test order. */
export async function runCleanPurchase(agentId: string): Promise<ScenarioOutcome> {
  const mandate = await freshMandate(agentId);
  const run = await runAgent({ mandateId: mandate.mandateId, prompt: DEMO_PROMPT, poisoned: false });
  return {
    label: "Clean purchase",
    expected: "ALLOW / AUTHORISED",
    expectedDecision: "ALLOW",
    expectedReasonCode: "AUTHORISED",
    mandate,
    run,
  };
}

/** Scenario 2 — poisoned catalog talks the agent into a ₹20,000 pick. Expect BLOCK / PRICE_LIMIT_EXCEEDED. */
export async function runPromptInjection(agentId: string): Promise<ScenarioOutcome> {
  const mandate = await freshMandate(agentId);
  const run = await runAgent({ mandateId: mandate.mandateId, prompt: DEMO_PROMPT, poisoned: true });
  return {
    label: "Prompt injection",
    expected: "BLOCK / PRICE_LIMIT_EXCEEDED",
    expectedDecision: "BLOCK",
    expectedReasonCode: "PRICE_LIMIT_EXCEEDED",
    mandate,
    run,
  };
}

/**
 * Scenario 3 — tampered signature. apps/web holds no private key, so it
 * can't sign a request itself; instead it gets a real, validly-signed
 * (mandate, request) pair from apps/agent's own /run, using a mandate
 * capped at ₹1 so that priming call is guaranteed to fail at check 07
 * (PRICE_LIMIT_EXCEEDED) before ever reaching the gateway or the nonce
 * table — the pair it returns is still fully signed regardless of that
 * outcome. The mandate is then altered (cap raised 1000x) without
 * re-signing, and sent to /authorize directly. Expect BLOCK /
 * MANDATE_SIGNATURE_INVALID.
 */
export async function runTamperedSignature(agentId: string): Promise<ScenarioOutcome> {
  const primingMandate = await freshMandate(agentId, { maxAmountPaise: 100, cumulativeLimitPaise: 100 });
  const priming = await runAgent({ mandateId: primingMandate.mandateId, prompt: DEMO_PROMPT, poisoned: false });

  const tamperedMandate: Mandate = { ...priming.mandate, maxAmountPaise: priming.mandate.maxAmountPaise * 1000 };
  const result = await authorizeDirect(tamperedMandate, priming.request);

  const run: RunResponse = { ...priming, mandate: tamperedMandate, result };
  return {
    label: "Tampered signature",
    expected: "BLOCK / MANDATE_SIGNATURE_INVALID",
    expectedDecision: "BLOCK",
    expectedReasonCode: "MANDATE_SIGNATURE_INVALID",
    mandate: tamperedMandate,
    run,
    note: `raised maxAmountPaise ${priming.mandate.maxAmountPaise} → ${tamperedMandate.maxAmountPaise} without re-signing`,
  };
}

/** Scenario 4 — resend a previously accepted signed request verbatim. Expect ALLOW once, then BLOCK / NONCE_REPLAYED. */
export async function runReplay(agentId: string): Promise<ScenarioOutcome> {
  const mandate = await freshMandate(agentId);
  const first = await runAgent({ mandateId: mandate.mandateId, prompt: DEMO_PROMPT, poisoned: false });

  const replayResult = await authorizeDirect(first.mandate, first.request);
  const run: RunResponse = { ...first, result: replayResult };
  return {
    label: "Replay",
    expected: "first ALLOW / AUTHORISED, replay BLOCK / NONCE_REPLAYED",
    expectedDecision: "BLOCK",
    expectedReasonCode: "NONCE_REPLAYED",
    mandate,
    run,
    note: `first attempt: ${first.result.decision} / ${first.result.reasonCode}`,
  };
}

export interface ConcurrentAttempt {
  round: number;
  decision: string;
  reasonCode: string;
}

export interface ConcurrentSpendOutcome {
  label: string;
  expected: string;
  mandate: Mandate;
  attempts: ConcurrentAttempt[];
  allowed: number;
  blocked: number;
  before: MandateStatus;
  after: MandateStatus;
  capHeld: boolean;
}

/**
 * Scenario 5 — five parallel purchase attempts against a cap sized for
 * exactly two: cumulativeLimitPaise is set to exactly 2x the deterministic
 * product price, so on a fair race exactly 2 of 5 land ALLOW and 3 land
 * BLOCK / SPEND_CAP_EXCEEDED, however the requests interleave — this is the
 * same shape tests/concurrency.spec.ts already proves against the atomic
 * reserve() in apps/passport/src/ledger.ts, just driven over the real
 * agent → passport path instead of a raw signed request.
 */
export async function runConcurrentSpend(agentId: string): Promise<ConcurrentSpendOutcome> {
  const mandate = await freshMandate(agentId, { cumulativeLimitPaise: CHEAPEST_PRODUCT_PAISE * 2 });
  const before = await getMandateStatus(mandate.mandateId);

  const runs = await Promise.all(
    Array.from({ length: 5 }, () => runAgent({ mandateId: mandate.mandateId, prompt: DEMO_PROMPT, poisoned: false })),
  );

  const after = await getMandateStatus(mandate.mandateId);
  const attempts: ConcurrentAttempt[] = runs.map((r, i) => ({
    round: i + 1,
    decision: r.result.decision,
    reasonCode: r.result.reasonCode,
  }));
  const allowed = attempts.filter((a) => a.decision === "ALLOW").length;
  const blocked = attempts.length - allowed;

  return {
    label: "Concurrent spend",
    expected: "exactly 2 ALLOW, 3 BLOCK / SPEND_CAP_EXCEEDED",
    mandate,
    attempts,
    allowed,
    blocked,
    before,
    after,
    capHeld: after.spentPaise + after.reservedPaise <= after.capPaise,
  };
}
