// Compares request.category against the mandate's signed category.
// Exists so a mandate scoped to one kind of purchase can't be used for another.
// Stops a manipulated agent from buying an unrelated category the user never approved.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 5,
  name: "category",
  run(ctx): CheckResult {
    if (ctx.request.category !== ctx.mandate.category) {
      return { ok: false, code: ReasonCode.CATEGORY_MISMATCH };
    }
    return { ok: true };
  },
};
