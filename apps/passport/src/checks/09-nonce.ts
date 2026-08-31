// Compares request.nonce against every nonce this passport has ever accepted.
// Exists because a valid, signed request is still dangerous if it can be re-sent.
// Stops a captured request from being replayed to trigger a second payment.
import { Prisma } from "@prisma/client";
import { ReasonCode, type Check, type CheckResult } from "@agent-passport/shared";
import { prisma } from "../db.js";

export const check: Check = {
  id: 9,
  name: "nonce",
  failCode: ReasonCode.NONCE_REPLAYED,
  async run(ctx): Promise<CheckResult> {
    // The unique constraint on UsedNonce.nonce is the replay check itself:
    // insert and let it fail, never SELECT then INSERT.
    try {
      await prisma.usedNonce.create({
        data: { nonce: ctx.request.nonce, mandateId: ctx.mandate.mandateId, agentId: ctx.request.agentId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { ok: false, code: ReasonCode.NONCE_REPLAYED };
      }
      // Anything else (DB down, etc.) is not a replay — rethrow and let the
      // pipeline's generic catch fail closed on it instead of us claiming a
      // reason code we can't actually back up.
      throw err;
    }
    return { ok: true };
  },
};
