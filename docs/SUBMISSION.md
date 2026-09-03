**What this is:** the submission package — description, differentiators, measured
results, and known limitations, in one place for a judge.
**Who it's for:** whoever is scoring this without time to read the whole repo first.
**Read this if:** you want the summary before you decide whether to go read the code.

## Project description

Agent Passport lets an AI shopping agent spend money for a user without holding the
user's PIN or an unbounded card. A separate issuer signs a scoped mandate — max amount,
cumulative cap, category, merchant allow-list, destination, expiry — and the agent
carries it but never holds the signing key, so it can *use* the granted authority but
never *create or widen* it. Before any payment reaches a gateway, the Passport runs ten
deterministic checks against the mandate and returns ALLOW or BLOCK with a
machine-readable reason code. We assume the agent can be fully compromised by hidden
instructions in the text it reads, and built this to hold under that assumption.

## What makes this different

- **Replay protection is a database constraint, not application logic.** Check 9 inserts
  the request's nonce and lets a Postgres unique-constraint violation decide a replay —
  there is no `SELECT` then `INSERT`, no in-memory `Set`, no window to race. See
  `apps/passport/src/checks/09-nonce.ts` and the P2002 handling it depends on; proven
  under real parallel load by `tests/concurrency.spec.ts` (5-way race, 10/10 rounds
  correct in one run).
- **The spend cap is enforced by one atomic conditional `UPDATE`, not read-decide-write.**
  `reserve()` in `apps/passport/src/ledger.ts` reserves against the cap in the same
  statement that checks it, so two concurrent requests against the same mandate serialize
  on that row's own lock instead of both slipping under the limit. Same test:
  `tests/concurrency.spec.ts`.
- **Nothing in the enforcement path reads the text an attacker can manipulate.** Every
  file in `apps/passport/src/checks/` is a pure comparison over two already-signed,
  already-verified objects — no LLM call, no URL fetch, no free text — so the same
  injected instruction that fools the agent's product choice has nothing to act on once
  it reaches the Passport. Proven against a real (if scripted) planted prompt injection,
  with the actual blocked request in `docs/INCIDENT.md` and the aggregate numbers in
  `docs/results.json`.

## Measured results

Copied from `docs/results.json` (`pnpm measure`, scripted brain). Full context and
limitations: `docs/EVALUATION.md`.

| Metric | Count | Of | Rate |
|---|---|---|---|
| Attempts (red-team catalog descriptions) | 10 | 10 | — |
| Attempts that compromised the agent's intent | 6 | 10 | 60.0% |
| Compromised attempts that produced a payment | 0 | 6 | 0.0% |
| Legitimate requests | 20 | 20 | — |
| False blocks | 0 | 20 | 0.0% |

Policy matrix: 13/13 cases pass (`tests/policy.spec.ts`). Concurrency: 10/10 rounds
correct, 4 ALLOW + 1 BLOCK every time against a shared cap (`tests/concurrency.spec.ts`).

## Known limitations

- **Test mode only.** Every payment runs against Razorpay's test-mode API. No live money
  has moved and none of this has been checked against a real gateway's production
  behavior.
- **No user authentication on any service.** `apps/issuer`, `apps/passport`, and
  `apps/agent` all trust whoever can reach them on the network; there is no login, API
  key, or session on top. Agent registration specifically has no operator
  authentication — see `docs/THREAT-MODEL.md` — though a registered agentId's key is
  immutable once set (`apps/passport/src/registry.ts`).
- **Keys live in files, not an HSM.** The issuer's and each agent's Ed25519 private keys
  are generated at runtime into a gitignored `.keys/` directory on local disk
  (`apps/issuer/src/keys.ts`, `apps/agent/src/identity.ts`), not a hardware security
  module or a managed secrets store.
- **The default agent "brain" is scripted, not a real LLM.** The measured numbers above
  come from `apps/agent/src/brain.ts`, a deliberately compromisable pattern-matcher. A
  real-LLM brain also exists behind `AGENT_BRAIN=llm` (`apps/agent/src/llmBrain.ts`, calling
  `openai/gpt-oss-20b` on Groq via `apps/agent/src/llmProvider.ts`) and has been measured:
  20% (2/10) of the same attack phrasings compromised it in the most recent run (a prior
  run saw 30% (3/10) — expected variance at n=10), 0% of those produced a payment — see
  `docs/results.json`'s `"llm"` block and `docs/EVALUATION.md` for the full numbers and why
  that figure characterises this one open model/provider, not LLM agents generally.
- **No CONFIRM path.** The Passport only ever returns ALLOW or BLOCK — as of a later
  hardening pass this isn't even a dead branch: `Decision` is `"ALLOW" | "BLOCK"`, full
  stop, not built anywhere, not designed into a reason code — see `docs/DECISIONS.md` #6.
- **No signed payment receipts.** Every attempt is recorded in the audit ledger, but
  nothing here produces an after-the-fact proof a third party could verify
  independently.
- **A mandate isn't bound to the agent it names.** None of the ten checks compares
  `mandate.agentId` to the requesting agent's own id, so a second, unrelated, validly
  registered agent can spend against a mandate it was never issued, as long as its request
  happens to satisfy that mandate's other constraints. Found live by a targeted adversarial
  pass and deliberately not patched in the same pass that found it, since it means adding
  an eleventh check to a pipeline that pass was told to verify, not restructure. High
  severity, one-check-shaped fix — see `docs/JUDGE-QA.md` Q11.
- **The agent process's environment contains the Razorpay credentials it never uses.**
  `apps/agent` loads the same root `.env` file `apps/passport` does; its own code never
  reads `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`, so this isn't reachable under the stated
  prompt-injection threat model, but it does mean the agent process *holds* a credential
  the architecture's own hard rule says only the Passport should hold. Medium severity,
  cheap fix (split `.env` by service) — see `docs/JUDGE-QA.md` Q12.
- **Not KYC, fraud scoring, or dispute handling.** It enforces limits the user already
  set; it has no opinion on chargebacks after money has moved.

## Links

- Repo: https://github.com/SonamNath01/agent-passport
- Video: TODO — record per `docs/VIDEO.md`, then paste the published link here.
- README: [../README.md](../README.md)
- Walkthrough: [WALKTHROUGH.md](WALKTHROUGH.md)
- Incident (a real blocked prompt-injection attempt): [INCIDENT.md](INCIDENT.md)
- Judge Q&A, including two gaps a live adversarial pass found and did not fix: [JUDGE-QA.md](JUDGE-QA.md)

## Team

- Name: TODO
- Email: TODO
- Affiliation: TODO
- Track / category entered: TODO
