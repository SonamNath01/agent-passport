import { ReasonCode, type AuthorizeResult, type Check, type CheckContext, type CheckResult } from "@agent-passport/shared";

import { check as check01 } from "./01-agent-signature.js";
import { check as check02 } from "./02-mandate-signature.js";
import { check as check03 } from "./03-expiry.js";
import { check as check04 } from "./04-merchant.js";
import { check as check05 } from "./05-category.js";
import { check as check06 } from "./06-quantity.js";
import { check as check07 } from "./07-amount.js";
import { check as check08 } from "./08-destination.js";
import { check as check09 } from "./09-nonce.js";
import { check as check10 } from "./10-spend.js";

const checks: Check[] = [
  check01,
  check02,
  check03,
  check04,
  check05,
  check06,
  check07,
  check08,
  check09,
  check10,
];

/**
 * Runs checks 1..10 in order, stopping at the first failure. `checks` in the
 * result only contains the checks that actually ran (fail-fast, no padding).
 * A check throwing is treated as that check failing on its own reason code —
 * fail closed, never let an exception escape as an implicit ALLOW. Checks 09
 * and 10 touch the database (nonce insert, spend reservation), so this runs
 * checks in sequence and awaits each one.
 */
export async function runPipeline(ctx: CheckContext): Promise<AuthorizeResult> {
  const report: AuthorizeResult["checks"] = [];

  for (const c of checks) {
    let result: CheckResult;
    try {
      result = await c.run(ctx);
    } catch {
      result = { ok: false as const, code: c.failCode };
    }

    report.push({ id: c.id, name: c.name, result });

    if (!result.ok) {
      return { decision: "BLOCK", reasonCode: result.code, checks: report };
    }
  }

  return { decision: "ALLOW", reasonCode: ReasonCode.AUTHORISED, checks: report };
}
