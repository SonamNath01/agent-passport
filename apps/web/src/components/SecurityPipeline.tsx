import { useEffect, useState } from "react";
import type { RunResponse } from "../types";

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

const REVEAL_MIN_MS = 120;
const REVEAL_MAX_MS = 180;

/**
 * Reveals `total` real results one at a time, 120-180ms apart. `runKey`
 * changes identity on every new run (a fresh object from setLatestRun), so
 * the effect restarts from zero even for a second run with the same
 * check count. This never invents a result — it only staggers when an
 * already-known result is shown.
 */
function useRevealCount(total: number, runKey: unknown): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    if (total === 0) return;

    let cancelled = false;
    let handle: ReturnType<typeof setTimeout>;

    const step = (next: number) => {
      if (cancelled) return;
      setCount(next);
      if (next < total) {
        const delay = REVEAL_MIN_MS + Math.random() * (REVEAL_MAX_MS - REVEAL_MIN_MS);
        handle = setTimeout(() => step(next + 1), delay);
      }
    };

    const delay = REVEAL_MIN_MS + Math.random() * (REVEAL_MAX_MS - REVEAL_MIN_MS);
    handle = setTimeout(() => step(1), delay);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, total]);

  return count;
}

interface Props {
  run: RunResponse | null;
  onFinished?: (finished: boolean) => void;
}

export default function SecurityPipeline({ run, onFinished }: Props) {
  const checks = run?.result.checks ?? [];
  const ranById = new Map(checks.map((c) => [c.id, c] as const));
  const revealCount = useRevealCount(checks.length, run);
  const finished = run !== null && revealCount >= checks.length;

  useEffect(() => {
    onFinished?.(finished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  return (
    <div className="pipeline">
      <div className="pipeline-head">
        <span>Security pipeline</span>
        <span className="pipeline-progress">
          {run ? `${Math.min(revealCount, checks.length)} / 10 checks run` : "10 checks — idle"}
        </span>
      </div>
      <ol className="pipeline-list">
        {CHECK_LABELS.map(({ id, label }) => {
          const index = id - 1;
          const ran = ranById.get(id);

          let state: "idle" | "queued" | "pass" | "fail" | "skipped";
          if (!run) {
            state = "idle";
          } else if (index >= checks.length) {
            state = "skipped";
          } else if (index < revealCount) {
            state = ran && ran.result.ok ? "pass" : "fail";
          } else {
            state = "queued";
          }

          return (
            <li key={id} className={`pipeline-row state-${state}`}>
              <span className="pipeline-id">{String(id).padStart(2, "0")}</span>
              <span className="pipeline-label">{label}</span>
              <span className="pipeline-status">
                {state === "idle" && "—"}
                {state === "queued" && "running…"}
                {state === "pass" && "PASS"}
                {state === "fail" && `FAIL · ${ran && !ran.result.ok ? ran.result.code : ""}`}
                {state === "skipped" && "NOT EVALUATED"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
