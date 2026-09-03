**What this is:** the fifteen hardest questions a technically strong payments judge could
ask, with the honest answer written from the code — not the pitch version.
**Who it's for:** whoever is defending this project in front of judges.
**Read this if:** you want to know exactly where the questioning will hurt before it
happens.

Two of these (Q11, Q12) are real gaps this pass found and did not fix, on purpose — see
each answer for why, and `docs/DECISIONS.md` / the phase report for the reasoning.

## 1. What stops the agent from just writing its own mandate?

It never holds the issuer's private key — only its own key, which signs transaction
requests, not mandates. Check 2 (`apps/passport/src/checks/02-mandate-signature.ts`)
verifies the mandate's `issuerSignature` against the issuer's public key on every
`/authorize` call. Hand-edit any field of a mandate — `maxAmountPaise`, the merchant
allow-list, `expiresAt` — and the signature no longer matches the new canonical bytes.
`MANDATE_SIGNATURE_INVALID`. Verified live in this pass: forging a mandate with a random
keypair instead of the real issuer key → `BLOCK / MANDATE_SIGNATURE_INVALID`.

## 2. What if the agent is completely taken over by an attacker?

That's the assumption this project is built on, not an edge case — see
`docs/THREAT-MODEL.md`. A fully controlled agent can choose any product, sign for real
with its own genuine key, and submit anything as a transaction request. It still cannot
pass a check it actually violates, forge the issuer's signature, replay a nonce past the
database's unique constraint, or reach Razorpay (see Q12 for the one place that claim
gets thinner than it should).

## 3. What if your Passport service itself is compromised?

Then the guarantee is gone. The issuer and the Passport, plus the Postgres database they
both write to, are the trusted computing base. A compromised Passport can skip its own
ten checks and return `ALLOW` regardless of what the mandate says — nothing in this
architecture defends against that, and nothing claims to. This project defends against
the agent being the compromised part, specifically because the agent is the one component
built to read attacker-controlled text all day. See `docs/THREAT-MODEL.md`.

## 4. Why not just ask the user to confirm every purchase?

The point is letting an agent act within limits set once, not paging a human on every
transaction. A middle `CONFIRM` verdict was considered and explicitly deferred — see
`docs/DECISIONS.md` #6. As of this pass it isn't even a dead branch: `Decision` is
`"ALLOW" | "BLOCK"` in `packages/shared/src/types.ts`, full stop. Getting those two
verdicts correct, tested, and measured came first.

## 5. Why not use an LLM to check whether the product matches the request?

Because the checks must never read the same untrusted text the agent reads. A check that
judges "does this product match the prompt" would itself be manipulable by the same
injected instruction it's supposed to catch — you'd be asking the attacker's own text to
grade itself. All ten checks in `apps/passport/src/checks/` compare only already-signed,
already-verified fields (amounts, ids, category strings), never free text, never a URL,
never a model call. That's a hard rule, not a style choice — see CLAUDE.md.

## 6. How is this different from a spending limit on a card?

A card limit caps total spend with no idea what it's for — any merchant, any category,
until the number runs out. A mandate is scoped per purchase: category, an explicit
merchant allow-list, a destination, an expiry, a per-transaction cap *and* a cumulative
cap, all checked before the payment happens, not settled or disputed after. A card limit
doesn't know the difference between a ₹500 pair of socks and a ₹500 gift card to a
merchant nobody approved; a mandate does.

## 7. What happens if the payment gateway times out?

The spend is reserved against the cap *before* Razorpay is ever called — check 10 runs
inside the Passport, ahead of the gateway call, so a slow or hanging gateway can never
cause a double-spend. If the call times out, the outcome is recorded as
`PENDING_UNKNOWN` and the reservation is deliberately left held, not blindly released or
committed — see `apps/passport/src/razorpay.ts` and `authorize.ts`'s ALLOW branch. No
retry-without-idempotency-key, no silent double order.

## 8. Did you actually prove the injection works, or is the agent scripted?

Honestly: the *default* brain (`apps/agent/src/brain.ts`) is a scripted pattern-matcher,
and its 60% compromise rate measures that scripted matcher, not a real model. But a real
LLM brain also exists and has been measured: `AGENT_BRAIN=llm` runs
`apps/agent/src/llmBrain.ts` against `openai/gpt-oss-20b` on Groq, with no anti-injection
system prompt. 20% of the same ten attack phrasings compromised it in the most recent run
(a prior run saw 30% — expected variance at n=10). In both cases, zero of the compromised
attempts produced an actual payment once the Passport's checks ran. See
`docs/EVALUATION.md` for the full numbers and the honest caveat that this characterises
one open model on one afternoon, not LLM agents in general.

## 9. How do you know the cap holds under load?

`tests/concurrency.spec.ts` fires five parallel requests at a cap sized to fit exactly
four, ten times in a row against a fresh mandate each round — 10/10 rounds landed exactly
four `ALLOW` and one `SPEND_CAP_EXCEEDED`, never five allows. This pass re-ran the same
shape live against the running HTTP stack (not just the in-process pipeline the automated
test drives) and got the same result: 4 ALLOW, 1 BLOCK, cap never breached. The mechanism
is one atomic conditional `UPDATE ... WHERE spent + reserved + amount <= cap` in
`apps/passport/src/ledger.ts`, not a read-then-write — see `docs/DECISIONS.md` #5 for why
that specific shape closes the race a naive read-decide-write leaves open.

## 10. What does this not protect against?

A compromised issuer or Passport (Q3). Bad limits the user set in the first place —
nothing here judges whether ₹5,000 was a sensible cap. Fraud, KYC, and chargeback
handling after money has moved. Whether the specific product the agent picked was
actually a *good* match for the request — an agent can buy a legitimate item that fits
every mandate constraint and is still a bad purchase; nothing here has an opinion on that.
And, as of this pass, two more specific things — Q11 and Q12.

## 11. What stops one agent from spending against a mandate issued to a different agent?

Nothing does, today. This pass tested it directly: register two agents, A and B, each
with their own real registered keypair; issue a mandate naming B as `agentId`; have A
build and sign a transaction request — for real, with A's own genuine key — that
satisfies every one of B's mandate constraints (merchant, category, amount, destination),
but puts A's own `agentId` in the request. Result: `ALLOW / AUTHORISED`. None of the ten
checks compares `mandate.agentId` to `request.agentId` — check 1 only proves the request
was really signed by whoever's `agentId` is in the request; it never asks whether that
agent is the one the mandate names. Combined with the already-documented fact that
`GET /mandates/:id` on the issuer requires no authentication (any agent that can guess or
observe a `mandateId` can fetch the full signed mandate), a second, unrelated agent —
potentially belonging to a different user entirely — can spend against a mandate it was
never granted, as long as its own request happens to satisfy that mandate's constraints.
This was found live in this pass and deliberately **not fixed**: adding an eleventh check
changes the check pipeline the project's own instructions call "verified" and told this
pass not to restructure. It is reported here instead of silently patched. The
one-line fix, for whoever picks this up next, is an eleventh check comparing
`mandate.agentId === request.agentId` — mechanically identical in shape to checks 4 and 8.
**Severity: high.** It does not currently produce a payment beyond what either agent's own
mandate would already allow on its own terms, but it breaks the stated binding between a
mandate and the agent it was issued to.

## 12. Does the agent process ever hold the Razorpay credentials?

In today's dev setup, yes — not in code, but in its process environment. `apps/agent`'s
`dev` script is `tsx watch --env-file=../../.env src/index.ts`, the same root `.env` file
`apps/passport` loads, and that file contains `RAZORPAY_KEY_ID` /
`RAZORPAY_KEY_SECRET`. Node's `--env-file` populates `process.env` for whichever process
loads it — there is no per-service scoping. `apps/agent/src/` never reads either variable
(confirmed by grep across the whole package: zero references), so under this project's
stated threat model — an agent manipulated or fully directed by attacker-controlled text —
this is not exploitable, because that threat model is about attacker-controlled *decisions*
the agent makes through its normal code paths, not arbitrary code execution inside the
agent's process. But it does contradict the literal hard rule "Only apps/passport holds
Razorpay credentials" — the agent process holds the value, it just never uses it. Under a
stronger attacker model (a supply-chain-compromised dependency inside `apps/agent`, or
any other way to get arbitrary code running in that process), the credential is sitting
right there in `process.env`, and nothing in the architecture would stop it from being
read and used to call Razorpay directly, bypassing the Passport and its ten checks
entirely. **Severity: medium** — not reachable under the documented threat model, real
under a slightly stronger one, and cheap to close (split `.env` so `apps/agent` only ever
loads the variables it actually uses — `ISSUER_URL`, `PASSPORT_URL`, `AGENT_PORT`,
`AGENT_BRAIN`, `GROQ_API_KEY` — never the Razorpay pair). Not fixed in this pass for the
same reason as Q11: it's an infrastructure/config change outside what this pass was asked
to touch, reported instead of silently patched.

## 13. What happens if a check itself fails — not the business rule, the check?

Until this pass, that check's own reason code got reused for any exception it threw —
a database timeout inside check 10 could report `SPEND_CAP_EXCEEDED`, a claim about a
comparison that was never actually evaluated. This pass added a distinct `INFRA_ERROR`
reason code: the pipeline's catch-all (`apps/passport/src/checks/pipeline.ts`) now reports
`INFRA_ERROR` for anything a check didn't explicitly and narrowly recognize as its own
business failure (check 9 still narrowly catches exactly the nonce unique-constraint
violation and rethrows everything else, unchanged). The *behaviour* was always fail-closed
— BLOCK either way — only the claimed reason changes. See `docs/DECISIONS.md` #7.

## 14. Why integer paise everywhere, never a floating-point rupee amount?

Every check does a direct numeric comparison against a signed limit. Floating-point
rounding can make an amount compare as equal to or less than a limit when the true rupee
value isn't — a bug like that is exactly the kind of thing a compromised agent doesn't
need handed to it. ₹5,000 is `500000`, always an integer, checked with `Number.isInteger`
at both the check layer (07-amount.ts) and the HTTP boundary (zod's `.int()` on every
amount field) — this pass verified the boundary live: a hand-crafted raw request with
`amountPaise: 50000.5` and a garbage signature gets a clean `400 invalid_authorize_request`
before it ever reaches a check. See `docs/DECISIONS.md` #1.

## 15. What's the actual measured compromise / false-block rate, and how much should I trust it?

Scripted brain: 60% (6/10) of red-team catalog descriptions talked it into an over-budget
choice; 0% of those produced a payment; 0% of 20 legitimate requests were wrongly blocked.
Real LLM brain (`openai/gpt-oss-20b` on Groq, no anti-injection prompt): 20% (2/10) most
recent run, 0% of those paid, 0% false blocks. Trust it as an order-of-magnitude signal,
not a precision figure — ten attack phrasings and twenty legitimate requests is enough to
catch an obvious bug, not enough to estimate a real-world rate with confidence, and the
LLM number is for one specific open model on one specific inference provider on one
afternoon. It does not generalise to other models, providers, prompts, or a real
adversarial catalog with more variety than four products. See `docs/EVALUATION.md`'s own
"Limitations of this evaluation" section — it says the same thing.
