import { useState } from "react";
import type { Mandate } from "@agent-passport/shared";
import type { RunResponse } from "../types";
import DecisionBanner from "../components/DecisionBanner";
import SecurityPipeline from "../components/SecurityPipeline";
import AuthorityPanel from "../components/AuthorityPanel";
import AgentDecisionPanel from "../components/AgentDecisionPanel";
import RequestInspector from "../components/RequestInspector";
import AuditFeed from "../components/AuditFeed";

interface Props {
  mandate: Mandate;
  latestRun: RunResponse | null;
  prompt: string;
  issuerPublicKey: string | null;
}

export default function SecurityConsoleScreen({ mandate, latestRun, prompt, issuerPublicKey }: Props) {
  const [pipelineFinished, setPipelineFinished] = useState(false);

  return (
    <div className="console">
      <DecisionBanner run={latestRun} pipelineFinished={pipelineFinished} />

      <div className="console-grid">
        <SecurityPipeline run={latestRun} onFinished={setPipelineFinished} />

        <div className="console-side">
          <AuthorityPanel mandate={mandate} />
          <AgentDecisionPanel run={latestRun} prompt={prompt} />
        </div>
      </div>

      <RequestInspector run={latestRun} issuerPublicKey={issuerPublicKey} />

      <AuditFeed />
    </div>
  );
}
