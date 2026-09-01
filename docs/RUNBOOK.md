**What this is:** environment variables, setup, and the fixes for the problems we
actually hit.
**Who it's for:** whoever is running this locally for the first time, or debugging it.
**Read this if:** something won't start, or you need to know what a variable does.

## Setup from scratch

```bash
git clone <this-repo>
cd agent-passport
pnpm install
cp .env.example .env        # then fill in RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
docker compose up -d        # Postgres 16 on :5432
pnpm db:push                # applies prisma/schema.prisma
pnpm seed                   # creates user_demo, agent_demo, prints the demo private key
pnpm dev                    # starts issuer, passport, agent, and web together
```

## Environment variables

| Variable | Example | Read by | Secret? |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://passport:passport@localhost:5432/agent_passport` | issuer, passport | contains a DB password |
| `ISSUER_PORT` | `4001` | issuer | no |
| `PASSPORT_PORT` | `4000` | passport | no |
| `AGENT_PORT` | `4002` | agent | no |
| `ISSUER_URL` | `http://localhost:4001` | passport, agent | no |
| `PASSPORT_URL` | `http://localhost:4000` | agent | no |
| `RAZORPAY_KEY_ID` | `rzp_test_...` | passport only | no (but keep test-mode only) |
| `RAZORPAY_KEY_SECRET` | (from your Razorpay dashboard) | passport only | **yes** |
| `RAZORPAY_TIMEOUT_MS` | `8000` | passport | no |
| `AGENT_BRAIN` | `scripted` (default) or `llm` | agent only | no |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | agent only, and only when `AGENT_BRAIN=llm` | **yes** |

`apps/web` reads no environment variables — it proxies same-origin paths to the other
three services (`apps/web/vite.config.ts`) and never talks to them directly.

## Start and stop

Start everything with `pnpm dev` (spawns all four `pnpm --filter <pkg> dev` processes
from `scripts/dev.ts` and prefixes their output). Stop with `Ctrl-C` — it sends `SIGTERM`
to every child. To run services individually instead, use `pnpm dev:issuer`,
`pnpm dev:passport`, `pnpm dev:agent`, `pnpm dev:web` in separate terminals. Stop Postgres
with `docker compose down` — this keeps the `pgdata` volume, so your data survives.

## Reset the database

```bash
docker compose down -v      # drops the pgdata volume — all data is gone
docker compose up -d
pnpm db:push
pnpm seed
```

There are no tracked migrations to replay — the schema is applied directly with
`prisma db push`, so this is the reliable way to get back to a clean state.

## Troubleshooting

**Install or dev server is slow, or files seem locked, under WSL.** If the repo lives
under `/mnt/c/...` (the Windows filesystem mounted into WSL), small-file operations —
exactly what `pnpm install` and TypeScript compilation do constantly — are slow and can
fail with file-lock errors. Keep the repo on the Linux filesystem instead, for example
`~/code/agent-passport`, not on a `/mnt/c` path.

**Prisma works, then suddenly doesn't, after switching between WSL and PowerShell.**
Prisma downloads a platform-specific query engine binary the first time you install.
Installing under WSL and then running under PowerShell (or the reverse) points the
project at an engine built for the other OS, and it fails at runtime. Pick one shell —
WSL is what this project is developed under — and don't mix installs across them.

**A `pnpm install` pulls in an unexpected compiler or ORM version.** Dependency versions
in this repo are pinned exactly (no `^` or `~`) on purpose: a resolver was once seen
picking release-candidate versions of the TypeScript compiler and the Prisma client,
which then behaved differently from what the code was written against. If you need to
bump a version, do it deliberately and re-run `pnpm typecheck` and `pnpm test` — don't let
`pnpm install` pick one for you.
