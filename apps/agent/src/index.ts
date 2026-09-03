import Fastify from "fastify";
import { loadOrRegisterAgentIdentity } from "./identity.js";
import { registerRunRoute } from "./run.js";
import { registerEventsRoute } from "./events.js";

const app = Fastify({ logger: true });

// Every foreseeable failure (bad input, mandate not found) is already
// replied to explicitly in its own route with a clean status code. Anything
// that reaches here is unexpected — except Fastify's own built-in 4xx errors
// (malformed JSON body, wrong content-type), which never reach a route
// handler at all and so never got a chance to reply for themselves. Those
// keep their real 4xx status; only a genuine 5xx (or no status — an
// ordinary thrown error) gets masked, logged server-side only.
app.setErrorHandler((err, _request, reply) => {
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({ error: "bad_request" });
  }
  app.log.error({ err }, "unhandled error");
  return reply.code(500).send({ error: "internal_error" });
});

const issuerUrl = process.env.ISSUER_URL ?? "http://localhost:4001";
const passportUrl = process.env.PASSPORT_URL ?? "http://localhost:4000";
const port = Number(process.env.AGENT_PORT ?? 4002);
const userId = process.env.AGENT_USER_ID ?? "user_demo";

async function main(): Promise<void> {
  const identity = await loadOrRegisterAgentIdentity(passportUrl, userId);

  // Read-only: the web app needs to know which already-registered agent to
  // address a mandate to. Never returns identity.privateKey.
  app.get("/identity", async () => ({ agentId: identity.agentId, publicKey: identity.publicKey }));

  registerEventsRoute(app);
  registerRunRoute(app, identity, issuerUrl, passportUrl);

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`agent listening on :${port} (agentId=${identity.agentId})`);
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
