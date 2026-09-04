**What this is:** environment variables, setup, and the fixes for the problems we
actually hit.
**Who it's for:** whoever is running this locally for the first time, or debugging it.
**Read this if:** something won't start, or you need to know what a variable does.

## Setup from scratch

```bash
git clone <this-repo>
cd agent-passport
pnpm install
cp .env.example .env                        # then fill in RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
cp apps/agent/.env.example apps/agent/.env  # agent-only vars — see "Two .env files" below
pnpm db:generate            # generates the Prisma client into node_modules — pnpm install
                             # does not do this on its own; a fresh clone's first seed/dev
                             # run fails with "does not provide an export named 'PrismaClient'"
                             # without it
docker compose up -d        # Postgres 16 on :5432
pnpm db:push                # applies prisma/schema.prisma
pnpm seed                   # creates user_demo, agent_demo, prints the demo private key
pnpm dev                    # starts issuer, passport, agent, and web together
```

## Two `.env` files, on purpose

The root `.env` (loaded by `apps/issuer` and `apps/passport`) and `apps/agent/.env`
(loaded only by `apps/agent`) are separate files — not a shared one, and not by accident.
`apps/agent` is the one process this project assumes can be fully compromised; giving it
its own env file that structurally cannot contain `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`
means "the agent can't reach the gateway" is true of what the process *can hold*, not just
what its code happens not to read. See `docs/JUDGE-QA.md` Q12. `pnpm measure` is the one
script that needs both — it imports the agent's brain code in-process — so its command
loads `--env-file=.env --env-file=apps/agent/.env` together.

## Environment variables

Root `.env` (issuer, passport):

| Variable | Example | Read by | Secret? |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://passport:passport@localhost:5432/agent_passport` | issuer, passport | contains a DB password |
| `ISSUER_PORT` | `4001` | issuer | no |
| `PASSPORT_PORT` | `4000` | passport | no |
| `ISSUER_URL` | `http://localhost:4001` | passport | no |
| `RAZORPAY_KEY_ID` | `rzp_test_...` | passport only | no (but keep test-mode only) |
| `RAZORPAY_KEY_SECRET` | (from your Razorpay dashboard) | passport only | **yes** |
| `RAZORPAY_TIMEOUT_MS` | `8000` | passport | no |

`apps/agent/.env` (agent only — a separate file so the agent process cannot hold the
Razorpay credentials even unused; see "Two `.env` files, on purpose" above):

| Variable | Example | Read by | Secret? |
|---|---|---|---|
| `ISSUER_URL` | `http://localhost:4001` | agent | no |
| `PASSPORT_URL` | `http://localhost:4000` | agent | no |
| `AGENT_PORT` | `4002` | agent | no |
| `AGENT_BRAIN` | `scripted` (default) or `llm` | agent | no |
| `LLM_PROVIDER` | `groq` (default) | agent, only when `AGENT_BRAIN=llm` | no |
| `LLM_MODEL` | `openai/gpt-oss-20b` (default) | agent, only when `AGENT_BRAIN=llm` | no |
| `GROQ_API_KEY` | `gsk_...` | agent, only when `AGENT_BRAIN=llm` | **yes** |

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

**I edited a `.ts` file and the running service is still serving the old code.** If the
repo lives under `/mnt/c/...`, `tsx watch` does not detect the change — inotify doesn't
fire across the 9p/drvfs mount Windows filesystem access goes through. This is silent:
the process keeps running and keeps serving the old code. Find the process on the
service's port, kill it, and run `pnpm --filter <package> dev` again (or restart
`pnpm dev`) before trusting a test against it. This only affects live-editing while a
service is running; it doesn't affect the quickstart above, since nothing there edits
code after starting a service.

**Passport crashed right after `pnpm dev` from cold, but comes up fine over two
terminals.** `pnpm dev` starts all four services in parallel, so on a cold start the
passport can call the issuer's `/public-key` before the issuer is listening, get
`ECONNREFUSED`, and exit. The two-terminal path in the quickstart hides this because it
starts the issuer first. Fixed: `apps/passport/src/index.ts` retries that fetch — 10
attempts, 1 second apart, each logged as a warning — before giving up. If you still see
it fail, the issuer took longer than ~10 seconds to boot (for example under heavy WSL
disk load on a `/mnt/c` path); just run `pnpm dev` again. The passport will never listen
without the issuer's key — it either gets it or exits, it doesn't silently start
unauthenticated.

**Create mandate fails with `400 {"error":"unknown_user_or_agent"}` right after a fresh
seed.** The agent service persists its identity (agentId + keypair) to
`.keys/agent.json` on the host filesystem so it survives restarts — but
`docker compose down -v` only wipes the Postgres volume, not that file. After a wipe,
the file still names an agentId from before the wipe, which the fresh, reseeded
database has never heard of; the web UI reads that stale id from `GET /api/agent/identity`
and asks the issuer to mint a mandate for an agent it has no record of. Fixed:
`apps/agent/src/identity.ts` checks the persisted agentId against the Passport
(`GET /agents/:id`) on every boot, and if it comes back 404, re-registers the same
agentId and keypair before serving `/identity` — no manual cleanup, no coordination
with `prisma/seed.ts` needed. If you ever need to force a brand-new agent identity
(new keypair too), delete `.keys/agent.json` and restart the agent service.

This is also probably what caused a one-off `500 {"code":"P2003", ...
agents_userId_fkey}"` seen from `scripts/demo.ts`'s own `/agents/register` call during
testing, though that specific failure is on a *different* column (`userId`, on a brand
new agent row that `demo.ts` registers itself — it doesn't touch `.keys/agent.json` at
all) and didn't reproduce across two full clean-wipe cycles run to verify the fix above.
Both are FK failures of the same shape — a row a client assumes exists has actually
been removed by a DB wipe — so if you see it again, check `docker compose ps` /
`pnpm seed` ran to completion before whatever hit it, rather than assuming it's this
same agentId bug.

**A `pnpm install` pulls in an unexpected compiler or ORM version.** Dependency versions
in this repo are pinned exactly (no `^` or `~`) on purpose: a resolver was once seen
picking release-candidate versions of the TypeScript compiler and the Prisma client,
which then behaved differently from what the code was written against. If you need to
bump a version, do it deliberately and re-run `pnpm typecheck` and `pnpm test` — don't let
`pnpm install` pick one for you.

**`apps/passport/test/spend-concurrency.test.ts` is slow, sometimes very slow.** Measured
15-95s for the same test depending on `/mnt/c` file cache warmth: a cold run — fresh
checkout, or the suite hasn't run in a while — pays for uncached module reads over the
9p/drvfs mount on top of the real DB round trips five parallel `/authorize` calls make; a
warm run (suite already run once recently) is fast. This isn't an intermittent failure,
it's the same cost every run under this filesystem, just paid at different times. The
test's timeout is set to 120s to absorb the cold case rather than flake on camera or in CI.
