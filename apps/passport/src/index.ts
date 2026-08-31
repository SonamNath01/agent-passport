import Fastify from "fastify";
import { registerAgentRoutes } from "./registry.js";
import { registerAuthorizeRoute } from "./authorize.js";
import { registerAuditRoutes } from "./audit.js";
import { registerMandateStatusRoute } from "./mandateStatus.js";

const app = Fastify({ logger: true });

const issuerUrl = process.env.ISSUER_URL ?? "http://localhost:4001";
const port = Number(process.env.PASSPORT_PORT ?? 4000);

async function main(): Promise<void> {
  const res = await fetch(`${issuerUrl}/public-key`);
  if (!res.ok) {
    throw new Error(`failed to fetch issuer public key from ${issuerUrl}: ${res.status}`);
  }
  const { publicKey } = (await res.json()) as { publicKey: string };

  registerAgentRoutes(app);
  registerAuthorizeRoute(app, publicKey);
  registerAuditRoutes(app);
  registerMandateStatusRoute(app);

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`passport listening on :${port} (issuer public key cached from ${issuerUrl})`);
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
