// Compares request.destination against the mandate's signed destination.
// Exists so authority to pay a merchant can't be silently redirected elsewhere.
// Stops an injected instruction from rerouting funds to an attacker-controlled address.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 8,
  name: "destination",
  run(ctx): CheckResult {
    if (ctx.request.destination !== ctx.mandate.destination) {
      return { ok: false, code: ReasonCode.DESTINATION_MISMATCH };
    }
    return { ok: true };
  },
};
