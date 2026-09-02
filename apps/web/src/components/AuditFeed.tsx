import { useEffect, useState } from "react";
import { getAuditEvents } from "../api";
import type { AuditEvent } from "../types";
import { clockTime, truncateMiddle } from "../format";

const POLL_MS = 3000;

const EVENT_LABELS: Record<string, string> = {
  authorize: "Authorise attempt",
  agent_registration_rejected: "Agent registration rejected",
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

// Every row here is a real audit_events row from the passport DB — never
// synthesised client-side. Polls rather than opening a fourth SSE
// connection; every authorize call (allowed or blocked) writes a row, so a
// 3s poll is fast enough to feel live without hammering the endpoint.
export default function AuditFeed() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getAuditEvents(25)
        .then((res) => {
          if (!cancelled) {
            setEvents(res.events);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "audit feed unreachable");
        });
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="audit-feed">
      <div className="panel-title">Audit ledger — live</div>
      {error && <div className="audit-error">{error}</div>}
      {events.length === 0 && !error && <div className="audit-empty">no audit events yet</div>}
      <table className="audit-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Agent</th>
            <th>Mandate</th>
            <th>Decision</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td className="mono">{clockTime(event.createdAt)}</td>
              <td>{eventLabel(event.type)}</td>
              <td className="mono">{event.agentId ? truncateMiddle(event.agentId, 14) : "—"}</td>
              <td className="mono">{event.mandateId ? truncateMiddle(event.mandateId, 14) : "—"}</td>
              <td>
                {event.decision && (
                  <span className={`audit-decision decision-${event.decision.toLowerCase()}`}>{event.decision}</span>
                )}
              </td>
              <td>{event.reasonCode ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
