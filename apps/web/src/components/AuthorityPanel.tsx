import { useEffect, useState } from "react";
import type { Mandate } from "@agent-passport/shared";
import { getMandateStatus } from "../api";
import type { MandateStatus } from "../types";
import { rupees } from "../format";

interface Props {
  mandate: Mandate;
}

const POLL_MS = 2000;

// The mandate's live spend ledger, polled from the passport's read-only
// status endpoint (apps/passport/src/mandateStatus.ts). The bar fills teal
// regardless of how much is spent — red on this panel would read as a
// second BLOCK signal next to the decision banner, which is confusing.
export default function AuthorityPanel({ mandate }: Props) {
  const [status, setStatus] = useState<MandateStatus | null>(null);

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
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mandate.mandateId]);

  const spentPct = status ? Math.min(100, (status.spentPaise / status.capPaise) * 100) : 0;
  const reservedPct = status ? Math.min(100 - spentPct, (status.reservedPaise / status.capPaise) * 100) : 0;

  return (
    <div className="authority-panel">
      <div className="panel-title">Authority</div>

      <div className="authority-grid">
        <div className="authority-field">
          <span className="authority-label">Agent</span>
          <span className="authority-value mono">{mandate.agentId}</span>
        </div>
        <div className="authority-field">
          <span className="authority-label">Per-transaction limit</span>
          <span className="authority-value">{rupees(mandate.maxAmountPaise)}</span>
        </div>
        <div className="authority-field">
          <span className="authority-label">Cumulative cap</span>
          <span className="authority-value">{rupees(mandate.cumulativeLimitPaise)}</span>
        </div>
        <div className="authority-field">
          <span className="authority-label">Remaining</span>
          <span className="authority-value authority-remaining">
            {status ? rupees(status.remainingPaise) : "…"}
          </span>
        </div>
      </div>

      <div className="spend-bar-track">
        <div className="spend-bar-spent" style={{ width: `${spentPct}%` }} />
        <div className="spend-bar-reserved" style={{ width: `${reservedPct}%` }} />
      </div>
      <div className="spend-legend">
        <span>
          <span className="legend-dot legend-spent" />
          spent {status ? rupees(status.spentPaise) : "…"}
        </span>
        <span>
          <span className="legend-dot legend-reserved" />
          reserved {status ? rupees(status.reservedPaise) : "…"}
        </span>
        <span className="spend-legend-cap">cap {status ? rupees(status.capPaise) : "…"}</span>
      </div>
    </div>
  );
}
