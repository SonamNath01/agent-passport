// Compares request.nonce against every nonce this passport has ever accepted.
// Exists because a valid, signed request is still dangerous if it can be re-sent.
// Stops a captured request from being replayed to trigger a second payment.
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";
import { prisma } from "../db.js";

export const check: Check = {
  id: 9,
  name: "nonce",
  failCode: ReasonCode.NONCE_REPLAYED,
  async run(ctx): Promise<CheckResult> {
    // The unique constraint on UsedNonce.nonce is the replay check itself:
    // insert and let it fail, never SELECT then INSERT.
    await prisma.usedNonce.create({
      data: { nonce: ctx.request.nonce, mandateId: ctx.mandate.mandateId, agentId: ctx.request.agentId },
    });
    return { ok: true };
  },
};
