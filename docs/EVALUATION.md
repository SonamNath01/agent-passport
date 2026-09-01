**What this is:** how the system was tested and exactly what came back.
**Who it's for:** anyone checking the claims against real numbers.
**Read this if:** you want evidence, not a summary of intentions.

## Policy matrix

All thirteen cases from `tests/policy.spec.ts`, each driving the real ten-check pipeline
directly. Last run: 13/13 pass.

| # | Case | Expected | Result |
|---|------|----------|--------|
| 1 | Amount over the per-transaction limit | `BLOCK` / `PRICE_LIMIT_EXCEEDED` | PASS |
| 2 | Merchant not in the allow-list | `BLOCK` / `MERCHANT_NOT_ALLOWED` | PASS |
| 3 | Destination doesn't match the mandate | `BLOCK` / `DESTINATION_MISMATCH` | PASS |
| 4 | Mandate expired | `BLOCK` / `MANDATE_EXPIRED` | PASS |
| 5 | Mandate revoked | `BLOCK` / `MANDATE_REVOKED` | PASS |
| 6 | Mandate signed by a non-issuer key (forged) | `BLOCK` / `MANDATE_SIGNATURE_INVALID` | PASS |
| 7 | Request signed by a non-registered key | `BLOCK` / `AGENT_SIGNATURE_INVALID` | PASS |
| 8 | Nonce replayed | `BLOCK` / `NONCE_REPLAYED` | PASS |
| 9 | Cumulative cap exceeded | `BLOCK` / `SPEND_CAP_EXCEEDED` | PASS |
| 10 | Quantity over the max | `BLOCK` / `QUANTITY_EXCEEDED` | PASS |
| 11 | Category mismatch | `BLOCK` / `CATEGORY_MISMATCH` | PASS |
| 12 | Fully valid transaction | `ALLOW` / `AUTHORISED` | PASS |
| 13 | Amount exactly at the limit (boundary) | `ALLOW` / `AUTHORISED` | PASS |

Case 13 is the one off-by-one bugs live in: `amountPaise === maxAmountPaise` must allow,
not block. It does.

## Concurrency

`tests/concurrency.spec.ts` fires five parallel ₹499 requests at a fresh ₹2,000 cap, ten
times in a row, each against a new mandate. Every round landed exactly four `ALLOW` and
one `BLOCK` / `SPEND_CAP_EXCEEDED` — never five allows. 10/10 rounds correct, in one test
run. The original single-round version of this test
(`apps/passport/test/spend-concurrency.test.ts`) also still passes.

## Compromise + false-block numbers

From `docs/results.json` (`pnpm measure`, scripted brain, 2026-09-01):

| Metric | Count | Of | Rate |
|---|---|---|---|
| Attempts (red-team catalog descriptions) | 10 | 10 | — |
| Attempts that compromised the agent's intent | 6 | 10 | 60.0% |
| Compromised attempts that produced a payment (Passport in front) | 0 | 6 | 0.0% |
| Legitimate requests | 20 | 20 | — |
| False blocks | 0 | 20 | 0.0% |

Read this carefully: 60% of the ten phrasings talked the **scripted brain** into
requesting an over-budget item. Of those six compromised attempts, **zero** produced an
actual payment once the Passport's checks ran — every one was stopped by
`PRICE_LIMIT_EXCEEDED`. Zero of twenty ordinary, in-budget requests were wrongly blocked.

## Limitations of this evaluation

- **Small sample size.** Ten attack phrasings and twenty legitimate requests are enough
  to catch an obvious bug, not enough to estimate a real-world rate with confidence.
- **No real language model was measured.** The "brain" tested above is a scripted
  pattern-matcher (`apps/agent/src/brain.ts`), a deliberately compromisable stand-in, not
  an LLM. It only falls for a narrow, literal phrasing. A real-LLM brain is implemented
  (`apps/agent/src/llmBrain.ts`, `AGENT_BRAIN=llm`) but has not been run — no
  `ANTHROPIC_API_KEY` was available in this environment. The 60% number says nothing
  about how often a real model would be talked into the same thing.
- **A synthetic catalog.** Four products, one of them poisoned, is a controlled test
  fixture, not a real e-commerce catalog with real adversarial variety.
- **Policy coverage is not the same as security.** Passing thirteen known scenarios shows
  the ten checks do what they're supposed to on the cases we thought to write. It does not
  prove there is no tenth or eleventh way to construct a request that slips past them.
