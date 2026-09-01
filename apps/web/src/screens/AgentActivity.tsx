import { useState } from "react";
import type { Mandate } from "@agent-passport/shared";
import { runAgent } from "../api";
import type { RunResponse, RunStep } from "../types";

interface Props {
  mandate: Mandate;
  prompt: string;
  onPromptChange: (value: string) => void;
  steps: RunStep[];
  onRunStarted: () => void;
  onRunFinished: (run: RunResponse) => void;
}

// Steps come from a global SSE bus (apps/agent/src/events.ts), not scoped to
// one run, so onRunStarted clears the list right before the fetch fires —
// good enough for one operator driving one run at a time on a projector.
export default function AgentActivityScreen({ mandate, prompt, onPromptChange, steps, onRunStarted, onRunFinished }: Props) {
  const [poisoned, setPoisoned] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun(): Promise<void> {
    setError(null);
    setRunning(true);
    onRunStarted();
    try {
      const run = await runAgent({ mandateId: mandate.mandateId, prompt, poisoned });
      onRunFinished(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : "agent run failed");
    } finally {
      setRunning(false);
    }
  }

  const selectedStep = steps.find((s) => s.stage.startsWith("selected "));
  const requestingStep = steps.find((s) => s.stage === "requesting authorisation");

  return (
    <div className="panel">
      <h2>Agent activity</h2>
      <p className="identity-line">mandate {mandate.mandateId}</p>
      {error && <div className="error-box">{error}</div>}

      <div className="field">
        <label htmlFor="agentPrompt">Prompt sent to the agent</label>
        <input id="agentPrompt" value={prompt} onChange={(e) => onPromptChange(e.target.value)} />
      </div>

      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={poisoned} onChange={(e) => setPoisoned(e.target.checked)} /> Poisoned catalog
        </label>
        <button className="primary" onClick={handleRun} disabled={running}>
          {running ? "Running…" : "Run agent"}
        </button>
      </div>

      {(selectedStep || requestingStep) && (
        <div className="highlight-box">
          <div className="title">about to request</div>
          {selectedStep && (
            <div>
              product: <strong>{selectedStep.stage.replace("selected ", "")}</strong> — ₹
              {(Number(selectedStep.detail.amountPaise) / 100).toLocaleString("en-IN")}
              {selectedStep.detail.overBudget ? " — ⚠ picked over the stated budget, not within it" : ""}
            </div>
          )}
          {requestingStep && (
            <div>
              amount requested: <strong>₹{(Number(requestingStep.detail.amountPaise) / 100).toLocaleString("en-IN")}</strong> to{" "}
              <span className="mono">{String(requestingStep.detail.merchantId)}</span>
            </div>
          )}
        </div>
      )}

      <ul className="step-list">
        {steps.length === 0 && <li className="step-detail">no run yet</li>}
        {steps.map((step, i) => (
          <li key={i}>
            <span className="step-check">{step.stage === "error" ? "✕" : "✓"}</span>
            <div>
              <div>
                {step.stage === "decision"
                  ? `decision: ${String(step.detail.decision)} / ${String(step.detail.reasonCode)}`
                  : step.stage}
              </div>
              {step.stage !== "decision" && Object.keys(step.detail).length > 0 && (
                <div className="step-detail">{JSON.stringify(step.detail)}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
