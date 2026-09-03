import { useState } from "react";
import type { Mandate } from "@agent-passport/shared";
import { resetDemoState } from "../api";
import type { RunResponse } from "../types";
import { rupees } from "../format";
import {
  DEMO_PROMPT,
  runCleanPurchase,
  runConcurrentSpend,
  runPromptInjection,
  runReplay,
  runTamperedSignature,
  type ConcurrentSpendOutcome,
  type ScenarioOutcome,
} from "../demoScenarios";

interface Props {
  identity: { agentId: string; publicKey: string } | null;
  onScenarioResult: (mandate: Mandate, run: RunResponse, prompt: string) => void;
  onReset: () => void;
}

type ScenarioKey = "clean" | "injection" | "tampered" | "replay" | "concurrent";

interface SingleRunEntry {
  kind: "single";
  outcome: ScenarioOutcome;
  matched: boolean;
}

type ResultEntry = SingleRunEntry | { kind: "concurrent"; outcome: ConcurrentSpendOutcome };

const SCENARIOS: { key: ScenarioKey; title: string; description: string; expect: string }[] = [
  { key: "clean", title: "1. Clean purchase", description: "Normal flow, in-budget product.", expect: "ALLOW / AUTHORISED + a real Razorpay test order" },
  { key: "injection", title: "2. Prompt injection", description: "Poisoned catalog steers the agent onto a ₹20,000 item.", expect: "BLOCK / PRICE_LIMIT_EXCEEDED" },
  { key: "tampered", title: "3. Tampered signature", description: "A validly signed mandate, one field altered before sending.", expect: "BLOCK / MANDATE_SIGNATURE_INVALID" },
  { key: "replay", title: "4. Replay", description: "Resend a previously accepted signed request, unchanged.", expect: "BLOCK / NONCE_REPLAYED" },
  { key: "concurrent", title: "5. Concurrent spend", description: "Five parallel requests race the remaining cap.", expect: "exactly 2 ALLOW, 3 SPEND_CAP_EXCEEDED, cap never exceeded" },
];

// Every button here calls the real issuer/agent/passport services over
// their real HTTP endpoints (apps/web/src/demoScenarios.ts) — nothing in
// this file simulates a decision or fabricates a check result.
export default function DemoScenariosScreen({ identity, onScenarioResult, onReset }: Props) {
  const [running, setRunning] = useState<ScenarioKey | null>(null);
  const [results, setResults] = useState<Partial<Record<ScenarioKey, ResultEntry>>>({});
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetNote, setResetNote] = useState<string | null>(null);

  async function runScenario(key: ScenarioKey): Promise<void> {
    if (!identity || running) return;
    setRunning(key);
    setError(null);
    setResetNote(null);
    try {
      if (key === "concurrent") {
        const outcome = await runConcurrentSpend(identity.agentId);
        setResults((prev) => ({ ...prev, concurrent: { kind: "concurrent", outcome } }));
        return;
      }

      const runner = { clean: runCleanPurchase, injection: runPromptInjection, tampered: runTamperedSignature, replay: runReplay }[key];
      const outcome = await runner(identity.agentId);
      const matched = outcome.run.result.decision === outcome.expectedDecision && outcome.run.result.reasonCode === outcome.expectedReasonCode;
      setResults((prev) => ({ ...prev, [key]: { kind: "single", outcome, matched } }));
      onScenarioResult(outcome.mandate, outcome.run, DEMO_PROMPT);
    } catch (err) {
      setError(err instanceof Error ? `${key}: ${err.message}` : `${key}: scenario failed`);
    } finally {
      setRunning(null);
    }
  }

  async function handleReset(): Promise<void> {
    setResetting(true);
    setError(null);
    try {
      await resetDemoState();
      setResults({});
      onReset();
      setResetNote("Mandates, spend ledgers, nonces, transactions and audit rows cleared. Agent identity untouched.");
    } catch (err) {
      setError(err instanceof Error ? `reset: ${err.message}` : "reset failed");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="panel demo-panel">
      <div className="demo-panel-head">
        <h2>Demo scenarios</h2>
        <span className="demo-panel-badge">not a production control surface</span>
      </div>
      <p className="demo-panel-sub">
        Each button drives the real issuer, agent, and passport services over their real endpoints — nothing here is
        simulated in the browser. Prompt used: <span className="mono">“{DEMO_PROMPT}”</span>
      </p>

      {!identity && <div className="error-box">waiting for the agent service…</div>}
      {error && <div className="error-box">{error}</div>}

      <div className="demo-scenario-grid">
        {SCENARIOS.map((s) => {
          const entry = results[s.key];
          return (
            <div key={s.key} className="demo-scenario-card">
              <div className="demo-scenario-title">{s.title}</div>
              <div className="demo-scenario-desc">{s.description}</div>
              <div className="demo-scenario-expect">expect: {s.expect}</div>
              <button className="primary" onClick={() => runScenario(s.key)} disabled={!identity || running !== null}>
                {running === s.key ? "Running…" : "Run"}
              </button>

              {entry?.kind === "single" && (
                <div className={`demo-result ${entry.matched ? "demo-result-ok" : "demo-result-bad"}`}>
                  {entry.matched ? "✓" : "✕"} {entry.outcome.run.result.decision} / {entry.outcome.run.result.reasonCode}
                  {entry.outcome.note && <div className="demo-result-note">{entry.outcome.note}</div>}
                </div>
              )}

              {entry?.kind === "concurrent" && (
                <ConcurrencyResult outcome={entry.outcome} />
              )}
            </div>
          );
        })}
      </div>

      <div className="demo-panel-footer">
        <button className="secondary" onClick={handleReset} disabled={resetting}>
          {resetting ? "Resetting…" : "Reset demo state"}
        </button>
        {resetNote && <span className="demo-reset-note">{resetNote}</span>}
      </div>
    </div>
  );
}

function ConcurrencyResult({ outcome }: { outcome: ConcurrentSpendOutcome }) {
  return (
    <div className={`demo-result ${outcome.capHeld && outcome.blocked === 3 ? "demo-result-ok" : "demo-result-bad"}`}>
      {outcome.allowed} ALLOW · {outcome.blocked} BLOCK — cap {outcome.capHeld ? "held" : "BREACHED"}
      <table className="demo-concurrency-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Decision</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {outcome.attempts.map((a) => (
            <tr key={a.round}>
              <td>{a.round}</td>
              <td>
                <span className={`audit-decision decision-${a.decision.toLowerCase()}`}>{a.decision}</span>
              </td>
              <td>{a.reasonCode}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="demo-result-note">
        cap {rupees(outcome.before.capPaise)} · before {rupees(outcome.before.spentPaise + outcome.before.reservedPaise)} committed+reserved · after{" "}
        {rupees(outcome.after.spentPaise + outcome.after.reservedPaise)} committed+reserved
      </div>
    </div>
  );
}
