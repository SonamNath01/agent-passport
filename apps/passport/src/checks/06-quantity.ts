// Compares request.quantity against the mandate's signed maxQuantity.
// Exists so a per-unit price limit can't be bypassed by ordering many units at once.
// Stops a manipulated agent from buying 50 of something priced to pass check 7 one at a time.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 6,
  name: "quantity",
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
