// Compares the request's signature against the agent's registered public key.
// Exists because the mandate alone proves nothing about who is presenting it.
// Stops a stolen or forged request from being replayed under someone else's identity.
import { ReasonCode, verifyPayload, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 1,
  name: "agent-signature",
  run(ctx): CheckResult {
    if (!ctx.agentPublicKey) {
      return { ok: false, code: ReasonCode.AGENT_SIGNATURE_INVALID };
    }
    const valid = verifyPayload(ctx.request, "agentSignature", ctx.agentPublicKey);
    if (!valid) {
      return { ok: false, code: ReasonCode.AGENT_SIGNATURE_INVALID };
    }
    return { ok: true };
  },
};
