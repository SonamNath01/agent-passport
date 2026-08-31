import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 7,
  name: "amount",
  failCode: ReasonCode.PRICE_LIMIT_EXCEEDED,
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
