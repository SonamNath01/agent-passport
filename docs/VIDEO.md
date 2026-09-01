**What this is:** the exact 90-second recording plan for the submission video, derived
from `docs/DEMO.md`.
**Who it's for:** whoever is at the keyboard during the recording.
**Read this if:** you are about to hit record.

## Format

No narration audio. Every segment has an on-screen caption instead — this survives a
noisy room, a bad microphone, or a judge watching muted. Captions are plain white text on
a dark translucent bar, bottom third of the screen, one sentence at a time.

## Recording setup (do this before hitting record)

1. Reset to a known state: `pnpm demo:reset` (wipes every table, drops the agent's
   persisted identity, then reseeds `user_demo` / `agent_demo`). Requires
   `docker compose up -d` already running.
2. Restart every service so nothing is holding stale in-memory state or a deleted
   agentId — kill anything on `:4000`–`:4002`/`:5173` and run `pnpm dev`. This matters
   even if you didn't edit code: `demo:reset` deleted `.keys/agent.json`, and `apps/agent`
   only re-registers on startup.
3. Confirm all four are actually up before recording, not just that `pnpm dev` printed
   something:
   - `curl -s localhost:4001/public-key`
   - `curl -s localhost:4000/audit?limit=1` → `{"events":[]}` (proves the reset worked)
   - `curl -s localhost:4002/` (any response — 404 is fine, it proves the port is live)
   - `curl -s -o /dev/null -w "%{http_code}\n" localhost:5173`
4. Confirm `.env` has real Razorpay **test-mode** keys — without them the ALLOW screen
   still shows the correct decision, just with no order id, which is a weaker recording.
5. Open the browser to `http://localhost:5173`. Zoom to 150% (`Ctrl`/`Cmd` `+` three
   times from default) so on-screen text reads clearly at 1080p. Close every other tab
   and any bookmarks bar so nothing but the app is visible.
6. Set the OS/browser window to exactly 1920×1080 (or record a maximized window on a
   1080p display) so captions can be composited at a fixed position in post.
7. Do one silent dry run of all six segments below before the real take, to confirm the
   agent's product pick and the Razorpay order id actually appear where expected — an
   `AGENT_BRAIN=scripted` run is deterministic, so the dry run and the real take should
   look identical.

## The script

| Time | On screen | Action | Caption |
|---|---|---|---|
| 0:00–0:12 | **Create mandate** tab, `localhost:5173` | Sit on the page for 2s, then fill in the defaults (₹5,000 max, footwear, `merchant_nike`/`merchant_zara`, 24h) and click **Issue mandate**. | "An AI shopping agent — spending inside limits a human set first." |
| 0:12–0:27 | Mandate confirmation / **Create mandate** result | Point at the signed mandate id and issuer signature that appear. | "The issuer signs the limits. The agent never sees that signing key." |
| 0:27–0:42 | **Agent activity** tab | Type prompt "Find me running shoes, my budget is ₹5000." Leave **Poisoned catalog** unchecked. Click **Run agent**. Let the SSE log fill in. | "Clean catalog: the agent picks a ₹4,500 pair and signs a request." |
| 0:42–0:52 | **Passport dashboard** tab | Let all ten checks render green, then hold on the ALLOW banner and the Razorpay order id. | "All ten checks pass. Real Razorpay test order. Money moves." |
| 0:52–1:07 | **Agent activity** tab | Check **Poisoned catalog**. Same prompt. Click **Run agent**. Let the SSE log fill in, showing the manipulated pick. | "Same prompt, same ₹5,000 budget — but this listing has a hidden instruction." |
| 1:07–1:22 | **Passport dashboard** tab | Show checks 1–6 green, then check 7 turning red; hold on the red banner and reason code. | "The agent got talked into asking for ₹20,000. Check 7 catches it." |
| 1:22–1:30 | **Passport dashboard** tab, zoomed on the banner | Hold static on `BLOCK / PRICE_LIMIT_EXCEEDED` and "not evaluated" on checks 8–10. | "No gateway call. No money moved. The agent was compromised — the payment wasn't." |

Total: 90 seconds across 7 segments. If a segment runs long in the take, trim from
0:12–0:27 (the mandate-confirmation hold) first — it carries the least new information.

## If something goes wrong mid-recording

- **A service is serving stale code.** Under WSL, `tsx watch` does not detect edits on a
  `/mnt/c` path. If you touched a file after step 2 above, kill that service's process and
  restart it, then redo the dry run — do not record against a service you edited without
  restarting.
- **Razorpay's test API is unreachable mid-take.** The ALLOW/BLOCK decision and the
  ten-check list don't depend on the gateway call succeeding, only the order id does. If
  segment 0:42–0:52 shows `payment.status: "FAILED"` instead of an order id, stop, run
  `pnpm demo:reset`, restart services, and re-take from the top rather than editing around
  it — a missing order id is a visibly weaker version of the same true result.
- **No usable take at all.** Fall back to a terminal recording of `pnpm demo:3`, which
  proves the same two scenarios — a clean ₹4,500 purchase with a real Razorpay order, and
  a poisoned catalog blocked at `PRICE_LIMIT_EXCEEDED` with no order created — as plain
  console output. Caption it the same way, at the same two timestamps.
