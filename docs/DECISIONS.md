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

- **Decision:** none of the ten checks call a model, fetch a URL, or read free text.
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

- **Decision:** the Passport returns only `ALLOW` or `BLOCK`; a middle "ask the user"
  verdict is designed for in the reason codes but not implemented.
- **Context:** some legitimate requests are ambiguous enough that a hard block feels too
  strict and a silent allow feels too loose.
- **Why we chose it:** getting `ALLOW` / `BLOCK` correct, tested, and measured was worth
  more than a half-built third path with no real way to notify a user yet.
- **What we gave up:** anything that ideally gets a human's yes/no today either passes
  every check or is blocked outright — no doc or pitch claims otherwise.
