import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 5,
  name: "category",
  failCode: ReasonCode.CATEGORY_MISMATCH,
  run(ctx): CheckResult {
    if (ctx.request.category !== ctx.mandate.category) {
      return { ok: false, code: ReasonCode.CATEGORY_MISMATCH };
    }
    return { ok: true };
  },
};
