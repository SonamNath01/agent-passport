import Fastify from "fastify";
import { loadOrCreateIssuerKeyPair } from "./keys.js";
import { registerMandateRoutes } from "./mandates.js";

const app = Fastify({ logger: true });

// Every foreseeable failure (bad input, not found, known FK violation) is
// already replied to explicitly in its own route with a clean status code.
// Anything that reaches here is unexpected — except Fastify's own built-in
// 4xx errors (malformed JSON body, wrong content-type), which never reach a
// route handler at all and so never got a chance to reply for themselves.
// Those keep their real 4xx status; only a genuine 5xx (or no status —
// meaning an ordinary thrown error) gets masked, logged server-side only.
app.setErrorHandler((err, _request, reply) => {
  const statusCode = err.statusCode ?? 500;
  if (statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({ error: "bad_request" });
  }
  app.log.error({ err }, "unhandled error");
  return reply.code(500).send({ error: "internal_error" });
});

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
