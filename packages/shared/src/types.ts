import type { ReasonCode } from "./codes.js";

export interface Mandate {
  mandateId: string;
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
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  issuerSignature: string;
}

export type UnsignedMandate = Omit<Mandate, "issuerSignature">;

export interface TransactionRequest {
  mandateId: string;
  agentId: string;
  merchantId: string;
  category: string;
  subcategory: string;
  amountPaise: number;
  quantity: number;
  destination: string;
  nonce: string;
  timestamp: string;
  agentSignature: string;
}

export type UnsignedTransactionRequest = Omit<TransactionRequest, "agentSignature">;

export type Decision = "ALLOW" | "CONFIRM" | "BLOCK";

export type CheckResult = { ok: true } | { ok: false; code: ReasonCode };

export interface CheckReport {
  id: number;
  name: string;
  result: CheckResult;
}

export interface CheckContext {
  mandate: Mandate;
  request: TransactionRequest;
  issuerPublicKey: string;
  /** Registered public key of the agent named in the request. Looked up and set by authorize.ts before the pipeline runs. */
  agentPublicKey?: string;
  /** Live revoked status of this mandate, looked up from the passport DB before the pipeline runs. */
  mandateRevoked?: boolean;
  /** Set by check 10 when it reserves cumulative spend; read by authorize.ts afterwards to commit or release it. */
  reservationId?: string;
  now: number;
}

export interface Check {
  id: number;
  name: string;
  /** Reason code this check reports when it fails closed on an unexpected internal error. */
  failCode: ReasonCode;
  run(ctx: CheckContext): CheckResult | Promise<CheckResult>;
}

/**
 * Outcome of the gateway call, separate from `decision`: decision is the
 * Passport's authorization verdict (did the ten checks pass), payment is
 * whether money actually moved. CREATED means the Razorpay order exists.
 * FAILED means the gateway call errored and the reservation was released.
 * PENDING_UNKNOWN means the call timed out — we don't know if it succeeded,
 * so the reservation is left held rather than released or committed.
 */
export type PaymentStatus = "CREATED" | "FAILED" | "PENDING_UNKNOWN";

export interface AuthorizeResult {
  decision: Decision;
  reasonCode: ReasonCode;
  checks: CheckReport[];
  /** Present only when decision is ALLOW and the gateway was actually called. */
  payment?: { status: PaymentStatus; orderId?: string };
}
