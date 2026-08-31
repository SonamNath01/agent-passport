import { prisma } from "./db.js";

const RAZORPAY_BASE_URL = "https://api.razorpay.com/v1";
const GATEWAY_TIMEOUT_MS = Number(process.env.RAZORPAY_TIMEOUT_MS ?? 8000);

export type GatewayOutcome =
  | { status: "CREATED"; orderId: string }
  | { status: "FAILED"; error: string }
  | { status: "PENDING_UNKNOWN" };

function authHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

/**
 * Creates a Razorpay test-mode order for an already-ALLOWed transaction.
 * `transactionRef` is the transaction request's nonce — globally unique
 * (check 09 enforces that before a Transaction row can exist), so it
 * doubles as our own dedup key and as Razorpay's `receipt`.
 *
 * There is no dedicated idempotency *header* for the Orders API: Razorpay
 * documents `X-Payout-Idempotency` only for the Payout and Composite APIs.
 * For Orders, `receipt` is itself the idempotency key — a second create
 * call with a receipt already used on the account is rejected outright
 * (BAD_REQUEST_ERROR), not silently deduplicated — so this checks locally
 * first, and falls back to looking the order up by receipt if Razorpay
 * still rejects it as a duplicate (e.g. our local record was lost).
 *
 * Every outbound call is logged with the "[gateway]" tag so a blocked
 * authorize call (which never reaches this function) can be shown to have
 * produced zero such log lines.
 */
export async function createOrder(
  transactionRef: string,
  amountPaise: number,
  currency: string,
): Promise<GatewayOutcome> {
  // nonce alone isn't unique on Transaction (a replay attempt legitimately
  // reuses it), so this also filters on razorpayOrderId being set — only
  // one row per nonce can ever have gotten that far.
  const existing = await prisma.transaction.findFirst({
    where: { nonce: transactionRef, razorpayOrderId: { not: null } },
    select: { razorpayOrderId: true },
  });
  if (existing?.razorpayOrderId) {
    return { status: "CREATED", orderId: existing.razorpayOrderId };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

  try {
    console.log(`[gateway] POST /orders receipt=${transactionRef} amountPaise=${amountPaise}`);
    const res = await fetch(`${RAZORPAY_BASE_URL}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader() },
      body: JSON.stringify({ amount: amountPaise, currency, receipt: transactionRef }),
      signal: controller.signal,
    });

    if (res.status === 400) {
      const body = (await res.json().catch(() => null)) as RazorpayErrorBody | null;
      if (body?.error?.code === "BAD_REQUEST_ERROR" && body.error.description?.toLowerCase().includes("receipt")) {
        return await fetchExistingByReceipt(transactionRef);
      }
      return { status: "FAILED", error: body?.error?.description ?? `HTTP ${res.status}` };
    }

    if (!res.ok) {
      return { status: "FAILED", error: `HTTP ${res.status}` };
    }

    const order = (await res.json()) as { id: string };
    return { status: "CREATED", orderId: order.id };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "PENDING_UNKNOWN" };
    }
    return { status: "FAILED", error: err instanceof Error ? err.message : "unknown gateway error" };
  } finally {
    clearTimeout(timeout);
  }
}

interface RazorpayErrorBody {
  error?: { code?: string; description?: string };
}

async function fetchExistingByReceipt(receipt: string): Promise<GatewayOutcome> {
  console.log(`[gateway] GET /orders?receipt=${receipt} (duplicate receipt fallback lookup)`);
  try {
    const res = await fetch(`${RAZORPAY_BASE_URL}/orders?receipt=${encodeURIComponent(receipt)}`, {
      headers: { authorization: authHeader() },
    });
    if (!res.ok) {
      return { status: "FAILED", error: `HTTP ${res.status} looking up existing order by receipt` };
    }
    const body = (await res.json()) as { items: { id: string }[] };
    const order = body.items[0];
    if (!order) {
      return { status: "FAILED", error: "receipt collision but no matching order found" };
    }
    return { status: "CREATED", orderId: order.id };
  } catch (err) {
    return { status: "FAILED", error: err instanceof Error ? err.message : "unknown gateway error" };
  }
}
