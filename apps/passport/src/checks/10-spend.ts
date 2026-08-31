// Compares spent + reserved + this amount against the mandate's cumulative cap.
// Exists so a compromised agent can't bleed the budget out across many small buys.
// Stops salami-slicing: many individually-allowed payments that together blow the cap.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";
import { reserve } from "../ledger.js";

export const check: Check = {
  id: 10,
  name: "spend",
  failCode: ReasonCode.SPEND_CAP_EXCEEDED,
  async run(ctx): Promise<CheckResult> {
    const reservationId = await reserve(
      ctx.mandate.mandateId,
      ctx.mandate.cumulativeLimitPaise,
      ctx.mandate.windowHours,
      ctx.request.amountPaise,
    );
    if (reservationId === null) {
      return { ok: false, code: ReasonCode.SPEND_CAP_EXCEEDED };
    }
    // Read by authorize.ts once the full pipeline result is known, to commit
    // or release this reservation — see apps/passport/src/ledger.ts.
    ctx.reservationId = reservationId;
    return { ok: true };
  },
};
