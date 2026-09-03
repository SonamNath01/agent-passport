import type { RunResponse } from "../types";
import { rupees } from "../format";

interface Props {
  run: RunResponse | null;
  prompt: string;
}

// AI DECISION, visually distinct from SECURITY AUTHORISATION — that split is
// the point of the project. This panel only ever describes what the agent
// *wanted*; it has no bearing on whether the payment happened.
export default function AgentDecisionPanel({ run, prompt }: Props) {
  return (
    <div className="agent-panel">
      <div className="panel-title">AI decision (not authority)</div>

      <div className="agent-field">
        <span className="agent-label">Brain</span>
        <span className="agent-value">{run ? run.brain.toUpperCase() : "—"}</span>
      </div>

      <div className="agent-field">
        <span className="agent-label">Intent</span>
        <span className="agent-value agent-intent">“{prompt}”</span>
      </div>

      {run ? (
        <div className="agent-selection">
          <div className="agent-field">
            <span className="agent-label">Selected</span>
            <span className="agent-value">
              {run.selection.name} · {rupees(run.selection.amountPaise)} × {run.selection.quantity}
            </span>
          </div>
          {run.selection.overBudget && (
            <div className="agent-warning">
              Picked above the ₹{run.selection.budgetRupees.toLocaleString("en-IN")} budget stated in the prompt —
              the agent's own judgement, not a security decision. The passport below decides whether it is allowed
              to happen.
            </div>
          )}
          {run.selection.reasoning && (
            <div className="agent-field">
              <span className="agent-label">Model's reasoning</span>
              <span className="agent-value agent-intent">“{run.selection.reasoning}”</span>
            </div>
          )}
        </div>
      ) : (
        <div className="agent-field">
          <span className="agent-label">Selected</span>
          <span className="agent-value">no run yet</span>
        </div>
      )}
    </div>
  );
}
