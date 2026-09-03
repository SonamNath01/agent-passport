import Fastify from "fastify";
import { registerAgentRoutes } from "./registry.js";
import { registerAuthorizeRoute } from "./authorize.js";
import { registerAuditRoutes } from "./audit.js";
import { registerMandateStatusRoute } from "./mandateStatus.js";
import { registerDemoResetRoute } from "./demoReset.js";

const app = Fastify({ logger: true });

const issuerUrl = process.env.ISSUER_URL ?? "http://localhost:4001";
const port = Number(process.env.PASSPORT_PORT ?? 4000);

const ISSUER_KEY_FETCH_ATTEMPTS = 10;
const ISSUER_KEY_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `pnpm dev` starts all four services in parallel, so on a cold start the passport
// can reach this fetch before the issuer is listening. Retry instead of dying on the
// first ECONNREFUSED — but never fall back to running without a key, since checks 2
// and beyond depend on it to verify every mandate signature.
async function fetchIssuerPublicKey(): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ISSUER_KEY_FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${issuerUrl}/public-key`);
      if (!res.ok) {
        throw new Error(`issuer responded ${res.status}`);
      }
      const { publicKey } = (await res.json()) as { publicKey: string };
      return publicKey;
    } catch (err) {
      lastErr = err;
      app.log.warn(
        `attempt ${attempt}/${ISSUER_KEY_FETCH_ATTEMPTS} to fetch issuer public key from ${issuerUrl} failed: ${
          (err as Error).message
        }`,
      );
      if (attempt < ISSUER_KEY_FETCH_ATTEMPTS) {
        await sleep(ISSUER_KEY_RETRY_DELAY_MS);
      }
    }
  }
  throw new Error(
    `failed to fetch issuer public key from ${issuerUrl} after ${ISSUER_KEY_FETCH_ATTEMPTS} attempts: ${
      (lastErr as Error).message
    }`,
  );
}

async function main(): Promise<void> {
  const publicKey = await fetchIssuerPublicKey();

  registerAgentRoutes(app);
  registerAuthorizeRoute(app, publicKey);
  registerAuditRoutes(app);
  registerMandateStatusRoute(app);
  registerDemoResetRoute(app);

  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`passport listening on :${port} (issuer public key cached from ${issuerUrl})`);
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
