import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 6,
  name: "quantity",
  failCode: ReasonCode.QUANTITY_EXCEEDED,
  run(ctx): CheckResult {
    if (
      !Number.isInteger(ctx.request.quantity) ||
      ctx.request.quantity < 1 ||
      ctx.request.quantity > ctx.mandate.maxQuantity
    ) {
      return { ok: false, code: ReasonCode.QUANTITY_EXCEEDED };
    }
    return { ok: true };
  },
};
