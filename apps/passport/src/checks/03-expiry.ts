import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 3,
  name: "expiry",
  failCode: ReasonCode.MANDATE_EXPIRED,
  run(ctx): CheckResult {
    // mandateRevoked comes from a DB lookup authorize.ts does before the
    // pipeline runs — a revoked mandate's signature is still valid, so the
    // signed payload alone can never tell us it was revoked.
    if (ctx.mandateRevoked) {
      return { ok: false, code: ReasonCode.MANDATE_REVOKED };
    }
    const expiresAt = Date.parse(ctx.mandate.expiresAt);
    // NaN (unparseable timestamp) fails closed as expired.
    if (Number.isNaN(expiresAt) || ctx.now > expiresAt) {
      return { ok: false, code: ReasonCode.MANDATE_EXPIRED };
    }
    return { ok: true };
  },
};
