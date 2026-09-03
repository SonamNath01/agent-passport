**What this is:** short records of the architecture choices that would otherwise need
re-explaining every time someone asks "why not just—".
**Who it's for:** anyone reviewing or extending the code.
**Read this if:** you're about to change one of these and want to know what you'd break.

### 1. Integer paise, never floats

- **Decision:** every money field is an integer count of paise (`amountPaise`,
  `maxAmountPaise`, ...), never a floating-point rupee amount.
- **Context:** every check does a direct numeric comparison against a signed limit.
- **Why we chose it:** floating-point rounding can make an amount compare as equal or
  less than a limit when it isn't; a compromised agent doesn't need a bug like that handed
  to it.
- **What we gave up:** raw JSON and logs show `500000`, not `₹5,000` — conversion happens
  only at display time.

### 2. A separate issuer process

- **Decision:** mandate signing runs in its own service (`apps/issuer`), not inside the
  Passport.
- **Context:** the Passport spends its day evaluating requests from an agent we assume is
  hostile.
- **Why we chose it:** keeping the one key that can mint new authority out of the process
  that parses hostile input shrinks the blast radius of a Passport bug or compromise.
- **What we gave up:** an extra service to run and keep in sync.

### 3. No LLM inside the check pipeline

- **Decision:** none of the checks call a model, fetch a URL, or read free text.
- **Context:** this project exists because an agent can be manipulated by text it reads.
- **Why we chose it:** a check that reads text could itself be manipulated by the same
  kind of injected instruction it's meant to catch.
- **What we gave up:** no fuzzy or semantic judgment in the gate — only exact comparisons
  against already-parsed, already-verified fields.

### 4. A database unique constraint for replay protection

- **Decision:** nonce replay is enforced by a unique index on `UsedNonce.nonce`, not an
  in-memory `Set`.
- **Context:** two `/authorize` calls with the same nonce can arrive nearly at once.
- **Why we chose it:** the database's own constraint is the only thing that can
  atomically say "never seen before" across concurrent requests and process restarts.
- **What we gave up:** one extra database round trip per request.

### 5. An atomic conditional update for the spend cap

- **Decision:** check 10 reserves spend with one `UPDATE ... WHERE spent + reserved +
  amount <= cap`, never a separate read then write.
- **Context:** two purchases against the same mandate can be authorized in parallel.
- **Why we chose it:** read-then-write leaves a window where both reads see room under
  the cap and both writes succeed, breaching it; one atomic statement closes that window.
- **What we gave up:** a harder-to-read query and two unwrapped statements instead of one
  transaction — see the comment in `apps/passport/src/ledger.ts` for why.

### 6. Deferring the CONFIRM path

- **Decision:** the Passport returns only `ALLOW` or `BLOCK`. A middle "ask the user"
  verdict is not implemented anywhere — not in the `Decision` type, not in the UI, not as
  a reason code. It exists only as this paragraph.
- **Context:** some legitimate requests are ambiguous enough that a hard block feels too
  strict and a silent allow feels too loose.
- **Why we chose it:** getting `ALLOW` / `BLOCK` correct, tested, and measured was worth
  more than a half-built third path with no real way to notify a user yet. An earlier pass
  left `"CONFIRM"` sitting in the `Decision` type and rendered (unreachably) in the web UI;
  a later hardening pass removed both, on the view that a value nothing ever produces
  should not exist in the type or the UI at all, not even as a dead branch.
- **What we gave up:** anything that ideally gets a human's yes/no today either passes
  every check or is blocked outright — no doc or pitch claims otherwise.

### 7. A distinct reason code for infrastructure failures

- **Decision:** a check that throws (DB unreachable, unexpected exception) blocks with
  `INFRA_ERROR`, never with that check's own business reason code.
- **Context:** the pipeline's catch-all used to reuse each check's own fail code for any
  exception, so a database error inside check 10 could read as `SPEND_CAP_EXCEEDED` — a
  claim the system never actually verified.
- **Why we chose it:** a reason code is a claim about what was checked. Reporting a
  business-rule failure for a condition that was never evaluated is a false statement,
  even though the fail-closed *behaviour* (BLOCK) was already correct either way.
- **What we gave up:** nothing — the field it replaced (`Check.failCode`) was unused for
  anything else, so removing it in favour of one pipeline-level code is a strict
  simplification, not a tradeoff.

### 8. Check 11 appended, not inserted where it semantically belongs

- **Decision:** check 11 (`mandate.agentId === request.agentId`) runs last, after check 10,
  even though it's an identity check that would more naturally sit right after checks 1
  and 2.
- **Context:** a live adversarial pass found that no check tied a mandate to the agent it
  was issued to — a second, unrelated, validly-registered agent could spend against a
  mandate it was never granted, as long as its own request happened to satisfy that
  mandate's other constraints. See `docs/JUDGE-QA.md` Q11.
- **Why we chose it:** inserting it after check 2 is the semantically correct position, but
  it would mean renumbering checks 3 through 10 — touching 8 filenames and `id` fields, and
  invalidating specific check numbers already cited in prose in `docs/INCIDENT.md` (a real
  audit-row narrative) and the not-yet-recorded `docs/VIDEO.md`/`docs/DEMO.md` scripts,
  which say "check 7 catches it" on camera. Appending is a pure addition: zero renumbering,
  zero existing "check N" reference anywhere goes stale.
- **What we gave up:** a mismatched request now reserves real cumulative spend at check 10
  before check 11 catches it and blocks. `authorize.ts` already releases that reservation
  on any BLOCK — this costs one wasted database round trip on a request that was always
  going to fail, not a correctness or security gap.
