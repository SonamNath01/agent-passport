**What this is:** the exact 90-second script for presenting Agent Passport live.
**Who it's for:** whoever is standing in front of judges or a room.
**Read this if:** you are about to give the demo.

## Pre-demo checklist

- [ ] `docker ps` shows `agent-passport-postgres` running.
- [ ] `pnpm db:push` and `pnpm seed` have been run at least once.
- [ ] All four services are up: `pnpm dev` (or `pnpm dev:issuer`, `pnpm dev:passport`,
      `pnpm dev:agent`, `pnpm dev:web` in four terminals).
- [ ] `.env` has real Razorpay **test-mode** `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` —
      without them the ALLOW screen still shows correctly, but with no order id.
- [ ] `data/catalog.clean.json` and `data/catalog.poisoned.json` exist (they ship in the
      repo; nothing to generate).
- [ ] Browser open to `http://localhost:5173`, zoomed in (Ctrl/Cmd `+` a few times) so
      the checks list reads from the back of the room.

## The script

| Sec | What you click or run | What you say |
|---|---|---|
| 0–10 | Sit on the **Create mandate** tab at `http://localhost:5173`. | "This is an AI shopping agent that can spend money — but only inside limits a human already signed off on." |
| 10–25 | Keep the defaults (₹5,000 max, footwear, `merchant_nike`/`merchant_zara`, 24h). Click **Issue mandate**. | "The issuer just signed this with its own private key. The agent never sees that key — it only ever carries the signed result." |
| 25–40 | Switch to **Agent activity**. Prompt: "Find me running shoes, my budget is ₹5000." Leave **Poisoned catalog** unchecked. Click **Run agent**. | "The agent reads a clean catalog, picks a ₹4,500 pair of shoes, signs a request, and asks the Passport to authorise it." |
| 40–50 | Switch to **Security console**. | "All ten checks passed. That's a real Razorpay test-mode order — this is the honest, working path." |
| 50–60 | Back to **Agent activity**. Check **Poisoned catalog**. Same prompt. Click **Run agent** again. | "Same prompt, same ₹5,000 budget. But now one listing in the catalog has a hidden instruction planted in it." |
| 60–75 | Switch to **Security console**. | "The agent got talked into asking for ₹20,000 instead. Checks 1 through 6 still pass — the signatures and the merchant are fine. Check 7, the amount, catches it." |
| 75–90 | Point at the red banner and the reason code. | "No gateway call happened after that. The agent was compromised. The payment wasn't." |

## If it breaks

**A service is serving stale code after an edit.** Under WSL, `tsx watch` does not detect
file changes on a `/mnt/c` path — the process keeps running the old build silently. Fix:
kill the process on that port and run `pnpm --filter <package> dev` again by hand.

**Razorpay's test API is unreachable or rate-limited mid-demo.** The `ALLOW` / `BLOCK`
decision and the ten-check list do not depend on the network call succeeding — only the
order id does. If the gateway call fails, the dashboard still shows the correct decision,
just with `payment.status: "FAILED"` instead of a Razorpay order id. Say so plainly and
move on; it isn't the point being demonstrated.

**Fallback with no browser at all.** Open a terminal and run:

```bash
pnpm demo:3
```

This proves the same two scenarios — a clean ₹4,500 purchase with a real Razorpay order,
and a poisoned catalog blocked at `PRICE_LIMIT_EXCEEDED` with no order created — as plain
console output, with a final "All pass-3 demo scenarios passed" line. No UI, no
projector, nothing that can visually fail.
