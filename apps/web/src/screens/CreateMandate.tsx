import { useState } from "react";
import type { Mandate } from "@agent-passport/shared";
import { createMandate } from "../api";

// Fields the spec asked for. merchantAllowlist and windowHours aren't on
// that list but the issuer requires both — they default to the two demo
// merchants and a 24h window (same defaults scripts/demo.ts uses) rather
// than becoming extra form fields.
const USER_ID = "user_demo";
const MERCHANT_ALLOWLIST = ["merchant_nike", "merchant_zara"];
const WINDOW_HOURS = 24;

function defaultValidUntil(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

interface Props {
  identity: { agentId: string; publicKey: string } | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  onCreated: (mandate: Mandate) => void;
}

export default function CreateMandateScreen({ identity, prompt, onPromptChange, onCreated }: Props) {
  const [maxAmountRupees, setMaxAmountRupees] = useState("5000");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState("FOOTWEAR");
  const [destination, setDestination] = useState("upi://merchant_nike@bank");
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [cumulativeCapRupees, setCumulativeCapRupees] = useState("20000");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Mandate | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!identity) return;
    setSubmitting(true);
    setError(null);
    try {
      const mandate = await createMandate({
        userId: USER_ID,
        agentId: identity.agentId,
        maxAmountPaise: Math.round(Number(maxAmountRupees) * 100),
        currency: "INR",
        cumulativeLimitPaise: Math.round(Number(cumulativeCapRupees) * 100),
        windowHours: WINDOW_HOURS,
        category,
        maxQuantity: Number(quantity),
        merchantAllowlist: MERCHANT_ALLOWLIST,
        destination,
        expiresAt: new Date(validUntil).toISOString(),
      });
      setCreated(mandate);
      onCreated(mandate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create mandate");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <h2>Create mandate</h2>
      {error && <div className="error-box">{error}</div>}
      {!identity && !error && <div className="error-box">waiting for the agent service…</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="prompt">What should the agent buy?</label>
          <input id="prompt" value={prompt} onChange={(e) => onPromptChange(e.target.value)} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="maxAmount">Max amount per purchase (₹)</label>
            <input id="maxAmount" type="number" min="1" value={maxAmountRupees} onChange={(e) => setMaxAmountRupees(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="quantity">Max quantity</label>
            <input id="quantity" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="category">Category</label>
            <input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="destination">Destination</label>
            <input id="destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="validUntil">Valid until</label>
            <input id="validUntil" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cumulativeCap">Cumulative cap (₹)</label>
            <input id="cumulativeCap" type="number" min="1" value={cumulativeCapRupees} onChange={(e) => setCumulativeCapRupees(e.target.value)} />
          </div>
        </div>

        <button className="primary" type="submit" disabled={!identity || submitting}>
          {submitting ? "Signing…" : "Issue mandate"}
        </button>
      </form>

      {created && (
        <div className="panel" style={{ marginTop: 20 }}>
          <h2>
            Mandate issued <span className="signed-badge">signed by issuer</span>
          </h2>
          <div className="mandate-card">
            <div className="row">
              <span className="label">mandateId</span>
              <span className="mono">{created.mandateId}</span>
            </div>
            <div className="row">
              <span className="label">agentId</span>
              <span className="mono">{created.agentId}</span>
            </div>
            <div className="row">
              <span className="label">max amount</span>
              <span>₹{(created.maxAmountPaise / 100).toLocaleString("en-IN")}</span>
            </div>
            <div className="row">
              <span className="label">cumulative cap</span>
              <span>₹{(created.cumulativeLimitPaise / 100).toLocaleString("en-IN")}</span>
            </div>
            <div className="row">
              <span className="label">category</span>
              <span>{created.category}</span>
            </div>
            <div className="row">
              <span className="label">destination</span>
              <span className="mono">{created.destination}</span>
            </div>
            <div className="row">
              <span className="label">expires</span>
              <span>{new Date(created.expiresAt).toLocaleString()}</span>
            </div>
            <div className="row">
              <span className="label">issuerSignature</span>
              <span className="mono">
                {created.issuerSignature.slice(0, 24)}…{created.issuerSignature.slice(-12)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
