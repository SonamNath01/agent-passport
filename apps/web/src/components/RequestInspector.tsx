import type { RunResponse } from "../types";
import { rupees, truncateMiddle } from "../format";

interface Props {
  run: RunResponse | null;
  issuerPublicKey: string | null;
}

function verificationLabel(run: RunResponse | null, checkId: 1 | 2): string {
  const check = run?.result.checks.find((c) => c.id === checkId);
  if (!check) return "NOT EVALUATED";
  return check.result.ok ? "VERIFIED" : "INVALID";
}

// The actual signed request the agent sent to the passport, exactly as the
// passport received it — never a private key, never a value we computed
// ourselves. Collapsed by default; this is supporting evidence, not the
// headline.
export default function RequestInspector({ run, issuerPublicKey }: Props) {
  return (
    <details className="request-inspector">
      <summary>Request inspector</summary>
      {!run ? (
        <div className="inspector-empty">No signed request yet — run the agent first.</div>
      ) : (
        <div className="inspector-grid">
          <div className="inspector-row">
            <span className="inspector-label">Amount</span>
            <span className="inspector-value">{rupees(run.request.amountPaise)}</span>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Merchant</span>
            <span className="inspector-value mono">{run.request.merchantId}</span>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Destination</span>
            <span className="inspector-value mono">{run.request.destination}</span>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Nonce</span>
            <span className="inspector-value mono">{run.request.nonce}</span>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Agent signature</span>
            <span className="inspector-value mono">{truncateMiddle(run.request.agentSignature)}</span>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Agent signature check</span>
            <span className={`inspector-badge badge-${verificationLabel(run, 1) === "VERIFIED" ? "ok" : "bad"}`}>
              {verificationLabel(run, 1)}
            </span>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Issuer public key</span>
            <span className="inspector-value mono">
              {issuerPublicKey ? truncateMiddle(issuerPublicKey) : "loading…"}
            </span>
          </div>
          <div className="inspector-row">
            <span className="inspector-label">Mandate signature check</span>
            <span className={`inspector-badge badge-${verificationLabel(run, 2) === "VERIFIED" ? "ok" : "bad"}`}>
              {verificationLabel(run, 2)}
            </span>
          </div>
        </div>
      )}
    </details>
  );
}
