import type { Mandate } from "@agent-passport/shared";
import type { AuditEvent, MandateStatus, RunResponse } from "./types";

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

// apps/issuer already serves this at boot (apps/passport/src/index.ts fetches
// it the same way) — the web app just hadn't been wired to it yet. Used for
// the request inspector's issuer-key fingerprint, never a private key.
export function getIssuerPublicKey(): Promise<{ publicKey: string }> {
  return json(fetch("/api/issuer/public-key"));
}

// apps/passport/src/audit.ts — every authorize attempt and registration
// event, blocked included. Polled by the audit feed.
export function getAuditEvents(limit = 25): Promise<{ events: AuditEvent[] }> {
  return json(fetch(`/api/passport/audit?limit=${limit}`));
}
