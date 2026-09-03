**What this is:** what Agent Passport assumes an attacker can do, and exactly what it
stops them from doing.
**Who it's for:** anyone deciding whether to trust this system, or trying to break it.
**Read this if:** you want the honest boundary of the guarantee, not the pitch.

## What we assume

We assume the agent can be manipulated by text it reads — a product description, a page
of search results, anything a tool call returns — and we go further: we assume the agent
can be **fully controlled** by an attacker. Not "tricked into one bad choice." Fully
controlled, as if the attacker were typing the agent's requests directly. The point of
this project is that the system still holds under that assumption, not under a milder
one.

## What an attacker who fully controls the agent can do

- Choose any product, merchant, amount, quantity, or destination and submit it as a
  transaction request.
- Sign that request for real — the agent holds its own genuine private key, so its
  signature is not forged, it is authentic and malicious.
- Attempt to replay an old signed request, resend the same nonce, or issue many small
  requests instead of one large one to try to slip under a limit.
- Read every `BLOCK` reason code the Passport returns and adjust the next attempt.
- Control the timing of requests, including firing several at once.
- Spend against a mandate issued to a *different* agent, as long as it presents its own
  genuine signature and its request happens to satisfy that mandate's other constraints.
  No check compares `mandate.agentId` to the requesting agent's own id — see
  `docs/JUDGE-QA.md` Q11 for the live test that confirmed this and why it wasn't fixed in
  the same pass that found it.

## What an attacker who fully controls the agent cannot do

- Make a request pass a check whose comparison it actually violates. The check runs
  inside the Passport process, on the signed mandate, not on anything the agent claims.
- Forge the issuer's signature on a mandate. The agent never holds the issuer's private
  key, so it cannot raise `maxAmountPaise`, add a merchant to the allow-list, push out
  `expiresAt`, or otherwise widen what it was granted.
- Reuse a nonce a second time. The database's unique constraint on `UsedNonce.nonce`
  rejects the second insert outright — this does not depend on the agent behaving well.
- Exceed the cumulative cap by splitting one big purchase into many small ones. Check 10
  reserves against the real ledger with an atomic update; there is no window where the
  agent's own count of "how much have I spent" is what gets trusted.
- Reach the Razorpay gateway through any code path this project ships — the only door to
  money `apps/agent`'s own code ever calls is `POST /authorize`. In the current dev setup
  the agent process's *environment* does contain the Razorpay credentials (it loads the
  same root `.env` file the Passport does, and Node's `--env-file` doesn't scope by
  service), even though `apps/agent/src/` never reads them — this isn't reachable under
  the prompt-injection threat model above, but would be under a stronger one (arbitrary
  code execution in the agent process). See `docs/JUDGE-QA.md` Q12.

## The trusted computing base

The trusted computing base is the issuer, the Passport, and the Postgres database they
both write to. This is the honest part: **if the issuer's private key or the Passport
process itself is compromised, every guarantee above fails.** A compromised issuer can
sign a mandate with no real limits. A compromised Passport can skip its own ten checks
and return `ALLOW` regardless of what the mandate says. This project does not defend
against compromise of its own trusted computing base — that is a host-security and
key-management problem, not something ten comparison checks can solve. What it defends
against is the agent, specifically, being the compromised part, because the agent is the
one component built to read attacker-controlled text all day.

## Mechanical guarantees versus problems outside our scope

Guaranteed **mechanically**, as an exact comparison against a signed mandate, with no
judgment call involved: the per-purchase amount limit, the cumulative spend cap, the
quantity limit, the merchant allow-list, the destination match, the category match, the
expiry, revocation, and replay protection. Every one of these either holds or the request
is blocked — there is no in-between.

Left **outside scope**, because it is a semantic or commercial problem, not a mechanical
one: whether the specific product the agent picked was actually a *good* match for what
the user asked for — an agent can buy a legitimate but bad-value item that still fits
every mandate constraint, and nothing here judges that. Whether the user set sensible
limits in the first place. Fraud scoring, KYC, and dispute handling after money has
already moved. And any content-level judgment about whether a product description is
deceptive — none of the ten checks read product descriptions at all, which is exactly why
they can't be manipulated by one.

Agent registration has no operator authentication, but keys are immutable once
registered; operator auth on registration is what a production deployment adds.

## The precise claim

We prevent a compromised or manipulated agent from converting unauthorised transaction intent into an authorised payment, provided the transaction violates a mechanically enforceable mandate constraint **and the mandate presented actually belongs to the presenting agent** — the second half of that clause is not yet itself a mechanically enforced constraint (see the mandate-ownership gap above and `docs/JUDGE-QA.md` Q11).
