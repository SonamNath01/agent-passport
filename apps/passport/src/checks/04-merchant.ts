// Compares request.merchantId against the mandate's signed merchant allowlist.
// Exists so the agent can only pay where the user actually authorised it.
// Stops a poisoned catalog page from redirecting payment to an attacker merchant.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 4,
  name: "merchant",
  run(ctx): CheckResult {
    if (!ctx.mandate.merchantAllowlist.includes(ctx.request.merchantId)) {
      return { ok: false, code: ReasonCode.MERCHANT_NOT_ALLOWED };
    }
    return { ok: true };
  },
};
