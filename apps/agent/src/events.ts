import { EventEmitter } from "node:events";
import type { FastifyInstance } from "fastify";

const bus = new EventEmitter();
bus.setMaxListeners(50);

export interface RunStep {
  stage: string;
  detail: Record<string, unknown>;
  timestamp: string;
}

/** Called from run.ts at each stage of a /run call; every connected /events client gets it immediately. */
export function emitStep(stage: string, detail: Record<string, unknown> = {}): void {
  const step: RunStep = { stage, detail, timestamp: new Date().toISOString() };
  bus.emit("step", step);
}

export function registerEventsRoute(app: FastifyInstance): void {
  app.get("/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const send = (step: RunStep): void => {
      reply.raw.write(`data: ${JSON.stringify(step)}\n\n`);
    };

    bus.on("step", send);
    request.raw.on("close", () => {
      bus.off("step", send);
    });
  });
}
