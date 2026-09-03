import type { AuthorizeResult, Mandate, TransactionRequest } from "@agent-passport/shared";

// Mirrors apps/agent/src/events.ts's RunStep — that type isn't exported from
// packages/shared (it's local to the agent's own SSE wire format), so this
// is a deliberate small duplication rather than reshaping the shared package
// for one field.
export interface RunStep {
  stage: string;
  detail: Record<string, unknown>;
  timestamp: string;
}

// Body of apps/agent's POST /run response — see apps/agent/src/run.ts.
export interface RunResponse {
  brain: "scripted" | "llm";
  selection: {
    productId: string;
    name: string;
    amountPaise: number;
    quantity: number;
    budgetRupees: number;
    overBudget: boolean;
    reasoning?: string;
  };
  mandate: Mandate;
  request: TransactionRequest;
  result: AuthorizeResult;
}

// Body of the passport's GET /mandates/:id/status — see
// apps/passport/src/mandateStatus.ts.
export interface MandateStatus {
  mandateId: string;
  agentId: string;
  capPaise: number;
  spentPaise: number;
  reservedPaise: number;
  remainingPaise: number;
}

// One row from the passport's GET /audit — see apps/passport/src/audit.ts.
// `detail` is whatever recordAuditEvent() was called with: `payment` on
// ALLOW, `attemptedPaise`/`authorisedPaise` on BLOCK (see
// apps/passport/src/authorize.ts's recordOutcome) — only `payment` is read
// anywhere in the web app today, and only when present.
export interface AuditEvent {
  id: string;
  type: string;
  mandateId?: string | null;
  agentId?: string | null;
  decision?: string | null;
  reasonCode?: string | null;
  detail?: { payment?: { status: string; orderId?: string }; attemptedPaise?: number; authorisedPaise?: number } | null;
  createdAt: string;
}
