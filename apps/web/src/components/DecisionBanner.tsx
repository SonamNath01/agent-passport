import type { RunResponse } from "../types";
import { rupees } from "../format";

interface Props {
  run: RunResponse | null;
  /** True once the pipeline has finished revealing every check it ran. */
  pipelineFinished: boolean;
}

// The single most important visual in the console. Every number here comes
// straight off the real /authorize response — nothing is computed ahead of
// what the pipeline actually returned, and nothing renders until the
// pipeline has finished revealing (pipelineFinished), so the verdict never
// appears before the checks that justify it.
export default function DecisionBanner({ run, pipelineFinished }: Props) {
  if (!run) {
    return (
      <div className="decision-banner idle">
        <div className="decision-headline">NO RUN YET</div>
        <div className="decision-sub">Run the agent to see a live authorisation decision.</div>
      </div>
    );
  }

  const checkCount = run.result.checks.length;

  if (!pipelineFinished) {
    return (
      <div className="decision-banner pending">
        <div className="decision-headline">RUNNING SECURITY PIPELINE…</div>
        <div className="decision-sub">Evaluating checks 1 through {checkCount} against the signed mandate.</div>
      </div>
    );
  }

  const { decision, reasonCode, payment } = run.result;
  const authorisedPaise = run.mandate.maxAmountPaise;
  const attemptedPaise = run.request.amountPaise;
  const excessPaise = attemptedPaise - authorisedPaise;

  if (decision === "BLOCK") {
    return (
      <div className="decision-banner block">
        <div className="decision-headline">PAYMENT BLOCKED</div>
        <div className="violation-figures">
          <div className="figure">
            <span className="figure-label">Authorised</span>
            <span className="figure-value">{rupees(authorisedPaise)}</span>
          </div>
          <div className="figure">
            <span className="figure-label">Attempted</span>
            <span className="figure-value">{rupees(attemptedPaise)}</span>
          </div>
          <div className="figure figure-excess">
            <span className="figure-label">Excess</span>
            <span className="figure-value">{excessPaise > 0 ? `+${rupees(excessPaise)}` : rupees(0)}</span>
          </div>
        </div>
        <div className="decision-reason">{reasonCode}</div>
        <div className="decision-gateway">RAZORPAY CALL NOT ATTEMPTED</div>
      </div>
    );
  }

  // Only ALLOW and BLOCK exist on the Decision type (see CLAUDE.md: "CONFIRM
  // path — not built"), so this is the ALLOW case without a third branch.
  return (
    <div className="decision-banner allow">
      <div className="decision-headline">AUTHORISED</div>
      <div className="decision-sub">All {checkCount} checks passed against the signed mandate.</div>
      <div className="decision-reason decision-reason-ok">{reasonCode}</div>
      <div className="decision-gateway">
        {payment?.status === "CREATED" && payment.orderId
          ? `RAZORPAY ORDER CREATED · ${payment.orderId}`
          : payment?.status === "FAILED"
            ? "RAZORPAY CALL FAILED — SPEND RESERVATION RELEASED"
            : payment?.status === "PENDING_UNKNOWN"
              ? "RAZORPAY CALL TIMED OUT — RESERVATION HELD"
              : "RAZORPAY CALL NOT ATTEMPTED"}
      </div>
    </div>
  );
}
