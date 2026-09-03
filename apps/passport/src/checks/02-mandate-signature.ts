// Compares the mandate's signature against the issuer's public key.
// Exists because a mandate is only authority if the trusted issuer actually signed it.
// Stops an agent (or anyone) from handing the Passport a self-issued or edited mandate.
import { ReasonCode, verifyPayload, type Check, type CheckResult } from "@agent-passport/shared";

export const check: Check = {
  id: 2,
  name: "mandate-signature",
  run(ctx): CheckResult {
    const valid = verifyPayload(ctx.mandate, "issuerSignature", ctx.issuerPublicKey);
    if (!valid) {
      return { ok: false, code: ReasonCode.MANDATE_SIGNATURE_INVALID };
    }
    return { ok: true };
  },
};
