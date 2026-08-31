import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { signPayload, type AuthorizeResult, type Mandate, type TransactionRequest } from "@agent-passport/shared";
import type { AgentIdentity } from "./identity.js";
import { loadCatalog } from "./catalog.js";
import { selectProduct } from "./brain.js";
import { emitStep } from "./events.js";

const RunBodySchema = z.object({
  mandateId: z.string().min(1),
  prompt: z.string().min(1),
  poisoned: z.boolean().optional(),
});

export function registerRunRoute(
  app: FastifyInstance,
  identity: AgentIdentity,
  issuerUrl: string,
  passportUrl: string,
): void {
  app.post("/run", async (request, reply) => {
    const parsed = RunBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_run_request", issues: parsed.error.issues });
    }
    const { mandateId, prompt, poisoned } = parsed.data;

    emitStep("understanding the request", { prompt, poisoned: Boolean(poisoned) });

    const mandateRes = await fetch(`${issuerUrl}/mandates/${mandateId}`);
    if (!mandateRes.ok) {
      emitStep("error", { message: `mandate ${mandateId} not found` });
      return reply.code(404).send({ error: "mandate_not_found" });
    }
    const mandate = (await mandateRes.json()) as Mandate;

    emitStep("searching", { catalog: poisoned ? "poisoned" : "clean" });
    const catalog = loadCatalog(Boolean(poisoned));

    let selection: ReturnType<typeof selectProduct>;
    try {
      selection = selectProduct(prompt, catalog);
    } catch (err) {
      emitStep("error", { message: err instanceof Error ? err.message : "product selection failed" });
      return reply.code(422).send({ error: "no_suitable_product" });
    }

    emitStep(`found ${selection.candidateCount} products`, { budgetRupees: selection.budgetRupees });
    emitStep("comparing", { candidateCount: selection.candidateCount });
    emitStep(`selected ${selection.product.name}`, {
      productId: selection.product.id,
      priceRupees: selection.product.priceRupees,
      injected: selection.injected,
    });

    const unsigned = {
      mandateId: mandate.mandateId,
      agentId: identity.agentId,
      merchantId: selection.product.merchantId,
      category: mandate.category,
      subcategory: selection.product.name,
      amountPaise: selection.product.priceRupees * 100,
      quantity: 1,
      destination: mandate.destination,
      nonce: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    const agentSignature = signPayload(
      { ...unsigned, agentSignature: "" } as TransactionRequest,
      "agentSignature",
      identity.privateKey,
    );
    const txRequest: TransactionRequest = { ...unsigned, agentSignature };

    emitStep("requesting authorisation", { amountPaise: txRequest.amountPaise, merchantId: txRequest.merchantId });

    const authRes = await fetch(`${passportUrl}/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandate, request: txRequest }),
    });
    const result = (await authRes.json()) as AuthorizeResult;

    emitStep("decision", { ...result });

    return reply.send({
      selection: {
        productId: selection.product.id,
        name: selection.product.name,
        priceRupees: selection.product.priceRupees,
        injected: selection.injected,
      },
      mandate,
      request: txRequest,
      result,
    });
  });
}
