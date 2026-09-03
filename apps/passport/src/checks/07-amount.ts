// Compares request.amountPaise against the mandate's signed maxAmountPaise.
// Exists because a per-purchase price ceiling is the most direct limit a user sets.
// Stops a manipulated agent from buying something priced over the stated budget.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 7,
  name: "amount",
  run(ctx): CheckResult {
    if (
      !Number.isInteger(ctx.request.amountPaise) ||
      ctx.request.amountPaise < 0 ||
      ctx.request.amountPaise > ctx.mandate.maxAmountPaise
    ) {
      return { ok: false, code: ReasonCode.PRICE_LIMIT_EXCEEDED };
    }
    return { ok: true };
  },
};
