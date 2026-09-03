**What this is:** every HTTP endpoint on all three services, generated from the actual
route handlers and zod schemas.
**Who it's for:** anyone integrating with, or testing, one service directly.
**Read this if:** you need exact request/response shapes and working curl commands.

Every curl example below was run against a local instance and works as shown (`docker
compose up -d && pnpm db:push && pnpm seed`, then `pnpm dev:issuer` / `pnpm dev:passport`
/ `pnpm dev:agent`). IDs, keys, and signatures shown are real but already used — re-running
a `POST /authorize` example verbatim gets `NONCE_REPLAYED`, not the original result.

Every endpoint below validates its input with zod and returns a clean `4xx` with a short
`error` code — never a stack trace. Anything genuinely unexpected (a database error, a bug)
is caught by a per-service Fastify error handler and returns `500 {"error":"internal_error"}`
with no internal detail; the real error is only ever logged server-side.

## Issuer (`:4001`) — `apps/issuer/src/`

### `GET /public-key`
Returns the issuer's Ed25519 public key. No request body, no errors.
```bash
curl http://localhost:4001/public-key
# {"publicKey":"MCowBQYDK2VwAyEA..."}
```

### `POST /mandates`
Signs and stores a new mandate. Body (all required):
`userId, agentId` (strings), `maxAmountPaise, cumulativeLimitPaise, windowHours,
maxQuantity` (positive integers), `currency` (`"INR"`), `category` (string),
`merchantAllowlist` (string[], min 1), `destination` (string), `expiresAt` (ISO 8601 with
offset). Returns `201` with the full signed `Mandate`. Errors: `400 invalid_mandate_request`
(zod validation issues), `400 unknown_user_or_agent` (FK violation).
```bash
curl -X POST http://localhost:4001/mandates -H "content-type: application/json" -d '{
  "userId":"user_demo","agentId":"agent_demo","maxAmountPaise":500000,"currency":"INR",
  "cumulativeLimitPaise":1000000,"windowHours":24,"category":"FOOTWEAR","maxQuantity":1,
  "merchantAllowlist":["merchant_nike","merchant_zara"],
  "destination":"upi://merchant_nike@bank","expiresAt":"2026-09-02T06:55:10.452Z"}'
```

### `GET /mandates/:id`
Returns the stored mandate, reconstructed so `issuerSignature` still verifies. Errors:
`404 mandate_not_found`.
```bash
curl http://localhost:4001/mandates/mandate_71b9381f-58fa-4889-9e4a-71fa8178b5bc
```

### `POST /mandates/:id/revoke`
Sets `revoked: true`. No body. Returns `{mandateId, revoked}`. Errors:
`404 mandate_not_found`.
```bash
curl -X POST http://localhost:4001/mandates/mandate_71b9381f-58fa-4889-9e4a-71fa8178b5bc/revoke
```

## Passport (`:4000`) — `apps/passport/src/`

### `POST /agents/register`
Registers an agent's public key. Body: `userId, name, publicKey` (all required strings).
Returns `201` with `{agentId, publicKey}`.
```bash
curl -X POST http://localhost:4000/agents/register -H "content-type: application/json" \
  -d '{"userId":"user_demo","name":"Docs Agent","publicKey":"MCowBQYDK2VwAyEA..."}'
```

### `GET /agents/:id`
Returns the stored agent row. Errors: `404 agent_not_found`.
```bash
curl http://localhost:4000/agents/cmtibbp0e001rdqwh2sr7g5so
```

### `POST /authorize`
Runs the ten-check pipeline. Body: `{mandate: Mandate, request: TransactionRequest}` —
same shapes as `POST /mandates`' response and a signed purchase request (`mandateId,
agentId, merchantId, category, subcategory, amountPaise, quantity, destination, nonce,
timestamp, agentSignature`). Returns `200` always (a `BLOCK` is not an HTTP error) with
`{decision, reasonCode, checks: [{id, name, result}], payment?}`. `payment` is present
only when `decision` is `ALLOW`. Errors: `400 invalid_authorize_request` (zod issues).
```bash
curl -X POST http://localhost:4000/authorize -H "content-type: application/json" \
  -d @request.json
# {"decision":"ALLOW","reasonCode":"AUTHORISED","checks":[...],
#  "payment":{"status":"CREATED","orderId":"order_TWge1MbkMcL6JF"}}
```

### `GET /audit?limit=50`
Most recent audit events, newest first. `limit` clamped to 1–200. Returns
`{events: [{id, type, mandateId, agentId, decision, reasonCode, detail, createdAt}]}`.
```bash
curl "http://localhost:4000/audit?limit=5"
```

### `GET /mandates/:id/status`
Read-only spend-ledger snapshot for the web dashboard. Returns `{mandateId, agentId,
capPaise, spentPaise, reservedPaise, remainingPaise}`. Errors: `404 mandate_not_found`.
```bash
curl http://localhost:4000/mandates/mandate_71b9381f-58fa-4889-9e4a-71fa8178b5bc/status
```

## Agent (`:4002`) — `apps/agent/src/`

### `GET /identity`
This agent instance's own id and public key (never the private key).
```bash
curl http://localhost:4002/identity
# {"agentId":"cmtft0q0z00007zwhsmppgauc","publicKey":"MCowBQYDK2VwAyEA..."}
```

### `GET /events`
Server-sent events stream of every `/run` step, for the web dashboard.
```bash
curl -N http://localhost:4002/events
```

### `POST /run`
Fetches a mandate, picks a product (`AGENT_BRAIN=scripted` by default, or `llm`), signs a
request, and calls the Passport. Body: `mandateId, prompt` (required strings), `poisoned`
(optional boolean — clean vs. poisoned catalog). Returns `{brain, selection, mandate,
request, result}`. Errors: `400 invalid_run_request`, `404 mandate_not_found`,
`422 no_suitable_product`.
```bash
curl -X POST http://localhost:4002/run -H "content-type: application/json" \
  -d '{"mandateId":"mandate_2b7a887d-36bb-42e0-8287-e3b9903cae36",
       "prompt":"Find me running shoes, my budget is ₹5000","poisoned":false}'
```
