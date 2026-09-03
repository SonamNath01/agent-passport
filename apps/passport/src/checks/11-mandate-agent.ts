// Compares request.agentId against the agentId the mandate itself was issued to.
// Exists so authority granted to one agent can't be spent by a different one.
// Stops a second, unrelated (but validly registered and signed) agent from presenting
// and spending against a mandate it was never granted, even with a genuine signature.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 11,
  name: "mandate-agent",
  run(ctx): CheckResult {
    if (ctx.request.agentId !== ctx.mandate.agentId) {
      return { ok: false, code: ReasonCode.MANDATE_AGENT_MISMATCH };
    }
    return { ok: true };
  },
};
