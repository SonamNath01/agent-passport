import Fastify from "fastify";
import { loadOrRegisterAgentIdentity } from "./identity.js";
import { registerRunRoute } from "./run.js";
import { registerEventsRoute } from "./events.js";

const app = Fastify({ logger: true });

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
