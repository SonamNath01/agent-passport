CLAUDE.md

Standing instructions for this repository. Read this before doing anything.

What this project is

Agent Passport — an authorisation layer that lets an AI agent make payments for a user without ever holding the user's PIN or unlimited spending power.

A separate mandate issuer signs a scoped permission (max amount, cumulative cap, category, quantity, merchant allow-list, destination, expiry). The agent carries that mandate but never holds the issuer's private key. Before any payment reaches the gateway, the Passport runs ten deterministic checks against the signed mandate and returns ALLOW / CONFIRM / BLOCK with a machine-readable reason code.

The governing rule: an agent may use authority, it may never create or widen it.

We assume the agent can be manipulated by text it reads (indirect prompt injection). The point of the system is that a compromised agent still cannot produce an unauthorised payment.

all pass
rule broken
User states limits
Issuer signs mandate
Agent chooses productASSUMED HOSTILE
Passport: 10 checks
Razorpay test API
BLOCK + reason code
Audit ledger
Services
Service	Port	Holds	Trust
apps/issuer	4001	issuer Ed25519 private key	trusted
apps/passport	4000	issuer public key, agent public keys, Razorpay credentials, DB	trusted
apps/agent	4002	its own Ed25519 private key only	assumed hostile
apps/web	5173	nothing	untrusted
packages/shared	—	canonical serialisation, crypto, types, reason codes	—
Feature status

Update this table at the end of every phase. Mark done only for things you have executed.

Feature	Phase	Status
Canonical serialisation + Ed25519 sign/verify	1	done
Issuer service, mandate signing, /public-key	1	done
Check pipeline, fail-closed, short-circuit	1	done
Checks 02 mandate-sig, 03 expiry, 05 category, 06 quantity, 07 amount	1	done
Prisma schema (7 models), seed, demo script	1	done
Check 01 agent signature	2	done
Check 04 merchant, 08 destination	2	done
Check 09 replay nonce (DB unique constraint)	2	done
Check 10 cumulative spend (atomic reserve/commit/release)	2	done
Mandate revocation	2	done
Audit rows for every attempt, blocked included	2	done
Razorpay test-mode order behind the gate	3	done — live order verified end-to-end via web UI, order_TWPuek5W7Dh7kU
Agent service, own keypair, SSE activity stream	3	done
Clean + poisoned catalog, injection demo	3	done
Web: create mandate / agent activity / Passport dashboard	4	done
Red attack dashboard state	4	done — BLOCK banner turns red with reason code; checks after the short-circuit point show "not evaluated", not PASS
Policy matrix tests (13 cases)	5	done — tests/policy.spec.ts, all 13 pass
Concurrency test (parallel spend race)	5	done — tests/concurrency.spec.ts, 10 rounds of 5-way race in one run, all 10 pass
Compromise + false-block measurement	5	done — tests/adversarial.spec.ts + scripts/measure.ts; scripted brain: 60% (6/10) attempts compromised agent intent, 0% (0/6) of those produced a payment, 0% (0/20) false blocks — see docs/results.json. LIMITATIONS: scripted brain only, not a real LLM measurement — see notes below
Real-LLM brain (AGENT_BRAIN=llm)	—	implemented, unmeasured — apps/agent/src/llmBrain.ts + brainSelector.ts call Claude (claude-opus-5) via strict structured output; no ANTHROPIC_API_KEY was available to run it, so no LLM numbers exist anywhere in this repo
Docs pack (11 files)	6	done — README + 10 files in docs/, all under their word limits, every number traced to docs/results.json or a real audit row
Agent registration hardening (immutable key per agentId)	—	done — apps/passport/src/registry.ts: same agentId + same key is an idempotent 200, same agentId + different key is a 409 and an audit_events row; apps/passport/test/agent-registration.test.ts, 4/4 pass
Fresh-clone verification, secrets scan, submission pack	7	done — two fresh clones ran pnpm demo start to finish after fixing the missing `pnpm db:generate` step; full-history secrets scan found nothing; docs/VIDEO.md, docs/SUBMISSION.md, LICENSE added. Deployment (optional, item 6) skipped — no cloud credentials in this environment
CONFIRM path (yellow)	—	not built — do not claim it in any doc
Signed receipts / non-repudiation	—	not built — do not claim it in any doc
Hard rules — never break these
Nothing in apps/passport/src/checks/ may call an LLM, fetch a URL, or read free text. A check takes two already-parsed objects and returns a verdict. That is all.
Fail closed. Any thrown error, missing field, or unknown state resolves to BLOCK. An exception must never produce ALLOW.
Canonical serialisation before every sign and every verify, through the one shared function. Never hand-roll JSON.stringify for signing.
All money is integer paise, with the unit in the field name (amountPaise, maxAmountPaise). No floats near a comparison. ₹5,000 = 500000.
Every field a check reads must be inside the signed payload.
Only apps/passport holds Razorpay credentials. If the agent process can reach the gateway, the architecture is broken.
Replay protection is a database unique constraint, never an in-memory Set, never SELECT-then-INSERT.
The spend cap is one atomic conditional UPDATE, never read-decide-write.
No bash-only scripts. Runnable scripts are Node + tsx.
Do not add dependencies without saying why in your report. Do not upgrade pinned versions.
Never claim in a doc what the code does not do. If a feature is marked not built above, it does not appear in README, DESIGN, or the pitch.
Readability rules — this code gets explained out loud to judges
Plain TypeScript. No dependency injection framework, no abstract factories, no decorators, no generics beyond what the type actually needs.
Every file in checks/ opens with a three-line comment: what it compares, why it exists, which attack it stops. Then the check. Maximum 40 lines per check file.
Name things the way you would say them out loud. spentPaise, not sp. isMerchantAllowed, not validate4.
Comments explain why, code shows what. Do not comment obvious lines.
One exported concept per file. No barrel-of-everything utils module.
The explain-out-loud test: if a file cannot be explained in two sentences, split it.
Prefer an early return over a nested conditional. Prefer a plain if over a clever ternary chain.
The ten checks

Run in numeric order, short-circuit on first failure.

#	Name	Compares	Failure code
1	agent signature	request signature vs registered agent public key	AGENT_SIGNATURE_INVALID
2	mandate signature	mandate signature vs issuer public key	MANDATE_SIGNATURE_INVALID
3	expiry / status	now < expiresAt, not revoked	MANDATE_EXPIRED, MANDATE_REVOKED
4	merchant	exact match in merchantAllowlist	MERCHANT_NOT_ALLOWED
5	category	exact match	CATEGORY_MISMATCH
6	quantity	quantity <= maxQuantity	QUANTITY_EXCEEDED
7	amount	amountPaise <= maxAmountPaise	PRICE_LIMIT_EXCEEDED
8	destination	exact match	DESTINATION_MISMATCH
9	replay	nonce unused (DB unique constraint)	NONCE_REPLAYED
10	cumulative spend	spent + reserved + amount <= cap	SPEND_CAP_EXCEEDED

Success code is AUTHORISED. Checks 4 and 8 are exact string matches — no prefix matching, no case-insensitive comparison, no fuzzy logic. Boundary case: amountPaise === maxAmountPaise must ALLOW.

Commands
docker compose up -d      # Postgres 16 only
pnpm install
pnpm db:push
pnpm seed
pnpm dev                  # all services
pnpm dev:issuer           # :4001
pnpm dev:passport         # :4000
pnpm dev:agent            # :4002
pnpm demo                 # scripted ALLOW / BLOCK / tampered-signature proof
pnpm test
pnpm measure              # adversarial + false-block numbers -> docs/results.json
Environment
Developed under WSL. This repo currently lives at `/mnt/c/Users/Sonam Nath/projects/agent-passport` — the Windows filesystem mounted into WSL. Small-file operations there are slow and can cause file-lock failures during install; moving the repo to the Linux filesystem (e.g. `~/code/agent-passport`) avoids this — see docs/RUNBOOK.md.
Do not mix WSL and PowerShell for installs. Prisma downloads a platform-specific engine binary; installing under one and running under the other breaks it.
Docker Desktop WSL integration is on; Postgres is at localhost:5432 from inside WSL.
tsx watch does not detect file changes on /mnt/c under WSL (inotify doesn't fire across the 9p/drvfs mount). A service left running under `pnpm dev` will keep serving the old code silently after an edit — kill and restart it manually (find the pid on its port, kill it, `pnpm --filter <package> dev` again) before trusting any test against it.
Node 22. Dependency versions are pinned on purpose.
How to work here
Phase discipline. Work only on the phase you were asked for. Finish it, verify it, report, and stop. Do not start the next phase.
Run what you write. Never report success on code you have not executed.
Read existing code before adding to it. Match the patterns already there.
When a decision is ambiguous, pick the simpler option and leave a one-line comment saying what you chose and why.
End-of-phase protocol

Before reporting a phase done, in this order:

Run the acceptance criteria in the phase prompt. All of them. Actually run them.
Update the Feature status table above.
From Phase 4 onward, update docs/WALKTHROUGH.md so its flowcharts and file list match the code as it now stands.
Report: what you built, what is stubbed, anything you changed from the spec, the commands to see it work. Then stop.

Phase prompts live in prompts/phase-N-*.md. To run one: read the file and execute it exactly.