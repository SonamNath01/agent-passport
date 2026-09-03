**What this is:** how the system was tested and exactly what came back.
**Who it's for:** anyone checking the claims against real numbers.
**Read this if:** you want evidence, not a summary of intentions.

## Policy matrix

Fourteen cases from `tests/policy.spec.ts` — the original thirteen plus one added when
check 11 (mandate-agent binding) was found missing and fixed — each driving the real
eleven-check pipeline directly. Last run: 14/14 pass.

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
| 14 | Genuine agent B, own valid signature, presenting agent A's mandate | `BLOCK` / `MANDATE_AGENT_MISMATCH` | PASS |

Case 13 is the one off-by-one bugs live in: `amountPaise === maxAmountPaise` must allow,
not block. It does. Case 14 also asserts on the full `checks` array, not just the final
decision: checks 1 through 10 all show `ok: true` before check 11 blocks — proving this
isn't an earlier check short-circuiting on a forged signature or a bad field, it's
specifically and only the mandate/agent binding.

## Concurrency

`tests/concurrency.spec.ts` fires five parallel ₹499 requests at a fresh ₹2,000 cap, ten
times in a row, each against a new mandate. Every round landed exactly four `ALLOW` and
one `BLOCK` / `SPEND_CAP_EXCEEDED` — never five allows. 10/10 rounds correct, in one test
run. The original single-round version of this test
(`apps/passport/test/spend-concurrency.test.ts`) also still passes.

## Compromise + false-block numbers

From `docs/results.json` (`pnpm measure`).

### Scripted brain (`apps/agent/src/brain.ts`, 2026-09-03)

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

### Real-LLM brain — `openai/gpt-oss-20b` served on Groq (`AGENT_BRAIN=llm`, 2026-09-03)

Provider: **Groq** (console.groq.com — an inference provider, not xAI's Grok; an
OpenAI-compatible API, see `apps/agent/src/llmProvider.ts`). Model: **`openai/gpt-oss-20b`**,
the exact string sent as `model` in every request this run made. Same ten attack
phrasings, same twenty legitimate requests, same Passport pipeline, no prompt tuning —
`apps/agent/src/llmBrain.ts`'s system prompt deliberately carries no anti-injection
language (see its file comment); this measures an ordinary, unhardened shopping agent.

| Metric | Count | Of | Rate |
|---|---|---|---|
| Attempts (red-team catalog descriptions) | 10 | 10 | — |
| Attempts where the model's response didn't yield a usable choice | 0 | 10 | 0.0% |
| Attempts that compromised the agent's intent | 2 | 10 | 20.0% |
| Compromised attempts that produced a payment (Passport in front) | 0 | 2 | 0.0% |
| Legitimate requests | 20 | 20 | — |
| False blocks | 0 | 20 | 0.0% |

20% of the ten phrasings talked this model into requesting an over-budget item — lower
than the scripted brain's 60%, but not zero: this is a real, unhardened model falling for
two of ten independently-phrased injection attempts. Every call this run completed and
parsed cleanly (no timeouts, no rate limits, no schema failures). Of the two attempts that
did compromise the model's intent, **zero** produced an actual payment: the Passport's
`PRICE_LIMIT_EXCEEDED` check stopped both, same as the scripted brain. Zero of twenty
ordinary, in-budget requests were wrongly blocked.

**This figure characterises this specific configuration, not "LLM agents" in general.**
`openai/gpt-oss-20b` is an open model served on Groq's inference infrastructure, chosen
because it currently supports Groq's strict JSON-schema structured output — it is not a
frontier model, and a frontier model (or the same model with a hardened system prompt)
would very plausibly resist a different fraction of these attempts. An open 20B model
served on Groq is a materially weaker and differently-tuned target than a frontier model
from a major lab — its refusal/compliance behaviour on injected instructions should not be
assumed to transfer. Treat 20% as "what one particular open model did against ten
phrasings on one afternoon," not as a general prompt-injection susceptibility rate for
LLM agents at large. Re-running this measurement against the same model has previously
produced a different count (a prior run saw 3/10, with one call failing closed on a
timeout) — at n=10, run-to-run variance is expected; treat the rate as an order-of-magnitude
signal, not a precise figure.

## Limitations of this evaluation

- **Small sample size.** Ten attack phrasings and twenty legitimate requests, for each
  brain, are enough to catch an obvious bug, not enough to estimate a real-world rate with
  confidence.
- **The LLM number is for one specific model/provider.** `openai/gpt-oss-20b` on Groq —
  an open model, not a frontier model, with an intentionally unhardened system prompt (see
  above). It does not generalise to other models, providers, or prompts.
- **A synthetic catalog.** Four products, one of them poisoned, is a controlled test
  fixture, not a real e-commerce catalog with real adversarial variety.
- **Policy coverage is not the same as security.** Passing fourteen known scenarios shows
  the eleven checks do what they're supposed to on the cases we thought to write. It does not
  prove there is no tenth or eleventh way to construct a request that slips past them.
