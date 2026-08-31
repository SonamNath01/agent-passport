# Agent Passport

An authorisation layer that lets an AI agent make payments on a user's behalf without holding the
user's PIN or unlimited spending authority. A **mandate issuer** signs a scoped mandate (max
amount, cumulative cap, category, quantity, merchant allow-list, destination, expiry). The agent
carries that mandate but never holds the issuer's private key. Before any payment reaches a
gateway, the **Passport** runs deterministic checks against the signed mandate and returns
ALLOW / CONFIRM / BLOCK with a machine-readable reason code.

This is **pass 1 of 3** of a hackathon build: workspace scaffold, signing/verification, and 5 of
10 checks. See `// TODO(pass-2)` comments for what's stubbed.

## Architecture

```
packages/shared/   canonical serialisation, Ed25519 sign/verify, shared types, reason codes
apps/issuer/        (:4001) generates/loads a keypair, signs mandates on request
apps/passport/       (:4000) runs the 10-check pipeline, persists transactions/audit events
prisma/              schema, migration state, seed script
scripts/demo.ts       proves one ALLOW and one BLOCK end to end over HTTP
```

Nothing in `apps/passport/src/checks/` calls an LLM, fetches a URL, or reads free text — every
check is a pure function over two already-parsed, already-verified objects. Any thrown error or
unknown state fails closed to BLOCK.

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` if you don't have it)
- Docker Desktop (for Postgres)

## Quickstart (PowerShell)

```powershell
git clone <this-repo>
cd agent-passport
pnpm install

Copy-Item .env.example .env

docker compose up -d
pnpm db:push
pnpm seed

# in separate terminals:
pnpm dev:issuer
pnpm dev:passport

# once both are up:
pnpm demo
```

`pnpm demo` issues a mandate for ₹5,000 (FOOTWEAR, qty 1), sends a ₹4,500 request (expect
`ALLOW / AUTHORISED`), a ₹20,000 request (expect `BLOCK / PRICE_LIMIT_EXCEEDED`), and a request
against a tampered mandate (expect `BLOCK / MANDATE_SIGNATURE_INVALID`).

## Tests

```powershell
pnpm test
```

Runs `packages/shared`'s canonicalisation + sign/verify round-trip tests, including a test that
mutates one signed field and asserts verification fails.

## What's implemented in this pass

- Checks 02 (mandate signature), 03 (expiry), 05 (category), 06 (quantity), 07 (amount).
- Checks 01 (agent signature), 04 (merchant allow-list), 08 (destination), 09 (nonce replay), 10
  (spend cap) are stubbed to `{ ok: true }` with `// TODO(pass-2)` — the pipeline already runs
  them in order so pass 2 only has to fill in their bodies.
- Full Prisma schema (`User`, `Agent`, `Mandate`, `Transaction`, `SpendLedger`, `AuditEvent`,
  `UsedNonce`) even though this pass only writes to `User`, `Agent`, `Mandate`, `Transaction`,
  `AuditEvent`.

## Not built in this pass

The agent service, the web frontend, Razorpay integration, the nonce store, the spend ledger,
revocation, and the CONFIRM decision path. These are scoped for passes 2 and 3.
