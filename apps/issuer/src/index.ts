import Fastify from "fastify";
import { loadOrCreateIssuerKeyPair } from "./keys.js";
import { registerMandateRoutes } from "./mandates.js";

const app = Fastify({ logger: true });
const keyPair = loadOrCreateIssuerKeyPair();

app.get("/public-key", async () => ({ publicKey: keyPair.publicKey }));

registerMandateRoutes(app, keyPair);

const port = Number(process.env.ISSUER_PORT ?? 4001);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`issuer listening on :${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
