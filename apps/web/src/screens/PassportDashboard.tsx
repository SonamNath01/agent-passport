import { useEffect, useState } from "react";
import type { Mandate } from "@agent-passport/shared";
import { getMandateStatus } from "../api";
import type { MandateStatus, RunResponse } from "../types";

interface Props {
  mandate: Mandate;
  latestRun: RunResponse | null;
}

const CHECK_LABELS: { id: number; label: string }[] = [
  { id: 1, label: "agent signature" },
  { id: 2, label: "mandate signature" },
  { id: 3, label: "expiry / status" },
  { id: 4, label: "merchant" },
  { id: 5, label: "category" },
  { id: 6, label: "quantity" },
  { id: 7, label: "amount" },
  { id: 8, label: "destination" },
  { id: 9, label: "replay" },
  { id: 10, label: "cumulative spend" },
];

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function PassportDashboardScreen({ mandate, latestRun }: Props) {
  const [status, setStatus] = useState<MandateStatus | null>(null);

  // Polls the read-only status endpoint every 2s rather than opening a
  // second SSE connection — the spend ledger (spent/reserved/remaining)
  // isn't part of the agent's "decision" step, so this is the smallest way
  // to keep the bar current between runs. See apps/passport/src/mandateStatus.ts.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getMandateStatus(mandate.mandateId)
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mandate.mandateId]);

  const result = latestRun?.result;
  const decision = result?.decision;
  const bannerClass = decision === "ALLOW" ? "allow" : decision === "BLOCK" ? "block" : decision === "CONFIRM" ? "confirm" : "idle";
  const orderId = result?.payment?.status === "CREATED" ? result.payment.orderId : undefined;

  const ranById = new Map(result?.checks.map((c) => [c.id, c] as const));

  return (
    <div className="panel">
      <h2>Passport dashboard</h2>

      <div className={`banner ${bannerClass}`}>
        {decision === "ALLOW" && (
          <>
            <div className="decision">AUTHORISED</div>
            <div className="reason">all ten checks passed</div>
          </>
        )}
        {decision === "BLOCK" && (
          <>
            <div className="decision">BLOCKED</div>
            <div className="reason">{result?.reasonCode}</div>
          </>
        )}
        {decision === "CONFIRM" && (
          <>
            <div className="decision">CONFIRM</div>
            <div className="reason">{result?.reasonCode}</div>
          </>
        )}
        {!decision && (
          <>
            <div className="decision">NO RUN YET</div>
            <div className="reason">run the agent on screen 2</div>
          </>
        )}
      </div>

      {orderId && (
        <div className="order-id">
          Razorpay test order: <span className="mono">{orderId}</span>
        </div>
      )}

      <div className="mandate-card" style={{ marginBottom: 16 }}>
        <div className="row">
          <span className="label">mandateId</span>
          <span className="mono">{mandate.mandateId}</span>
        </div>
        <div className="row">
          <span className="label">agentId</span>
          <span className="mono">{mandate.agentId}</span>
        </div>
      </div>

      <h2>Cumulative spend</h2>
      {status ? (
        <>
          <div className="spend-bar-track">
            <div
              className="spend-bar-spent"
              style={{ width: `${Math.min(100, (status.spentPaise / status.capPaise) * 100)}%` }}
            />
            <div
              className="spend-bar-reserved"
              style={{ width: `${Math.min(100, (status.reservedPaise / status.capPaise) * 100)}%` }}
            />
          </div>
          <div className="spend-legend">
            <span>
              <span className="legend-dot" style={{ background: "var(--red-fg)" }} />
              spent {rupees(status.spentPaise)}
            </span>
            <span>
              <span className="legend-dot" style={{ background: "var(--amber-fg)" }} />
              reserved {rupees(status.reservedPaise)}
            </span>
            <span>remaining {rupees(status.remainingPaise)}</span>
            <span>cap {rupees(status.capPaise)}</span>
          </div>
        </>
      ) : (
        <p className="identity-line">loading spend ledger…</p>
      )}

      <h2 style={{ marginTop: 20 }}>Checks</h2>
      <ul className="check-list">
        {CHECK_LABELS.map(({ id, label }) => {
          const ran = ranById.get(id);
          const state = !ran ? "pending" : ran.result.ok ? "pass" : "fail";
          return (
            <li key={id} className={state}>
              <span className="check-name">
                <span className="check-id">#{id}</span>
                <span>{label}</span>
              </span>
              <span>
                {state === "pass" && "PASS"}
                {state === "fail" && `FAIL — ${"code" in ran!.result ? ran!.result.code : ""}`}
                {state === "pending" && "not evaluated (pipeline short-circuited before this check)"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
