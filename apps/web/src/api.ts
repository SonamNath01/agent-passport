import type { Mandate } from "@agent-passport/shared";
import type { MandateStatus, RunResponse } from "./types";

async function json<T>(pending: Promise<Response>): Promise<T> {
  const res = await pending;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateMandateInput {
  userId: string;
  agentId: string;
  maxAmountPaise: number;
  currency: "INR";
  cumulativeLimitPaise: number;
  windowHours: number;
  category: string;
  maxQuantity: number;
  merchantAllowlist: string[];
  destination: string;
  expiresAt: string;
}

export function createMandate(input: CreateMandateInput): Promise<Mandate> {
  return json(
    fetch("/api/issuer/mandates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export function getAgentIdentity(): Promise<{ agentId: string; publicKey: string }> {
  return json(fetch("/api/agent/identity"));
}

export function runAgent(input: { mandateId: string; prompt: string; poisoned: boolean }): Promise<RunResponse> {
  return json(
    fetch("/api/agent/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export function getMandateStatus(mandateId: string): Promise<MandateStatus> {
  return json(fetch(`/api/passport/mandates/${mandateId}/status`));
}
