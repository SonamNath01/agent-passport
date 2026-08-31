import { ReasonCode, verifyPayload, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 2,
  name: "mandate-signature",
  failCode: ReasonCode.MANDATE_SIGNATURE_INVALID,
  run(ctx): CheckResult {
    const valid = verifyPayload(ctx.mandate, "issuerSignature", ctx.issuerPublicKey);
    if (!valid) {
      return { ok: false, code: ReasonCode.MANDATE_SIGNATURE_INVALID };
    }
    return { ok: true };
  },
};
