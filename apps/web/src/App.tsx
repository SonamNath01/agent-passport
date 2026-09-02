import { useEffect, useState } from "react";
import type { Mandate } from "@agent-passport/shared";
import { getAgentIdentity, getIssuerPublicKey } from "./api";
import type { RunResponse, RunStep } from "./types";
import CreateMandateScreen from "./screens/CreateMandate";
import AgentActivityScreen from "./screens/AgentActivity";
import SecurityConsoleScreen from "./screens/SecurityConsole";

type Tab = "mandate" | "agent" | "console";
type Identity = { agentId: string; publicKey: string };

// Screens never talk to each other directly — App is the only place that
// holds the mandate, the run result, and the one shared SSE connection to
// the agent's /events stream, and passes them down as props.
export default function App() {
  const [tab, setTab] = useState<Tab>("mandate");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [issuerPublicKey, setIssuerPublicKey] = useState<string | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [prompt, setPrompt] = useState("Buy me running shoes under ₹5,000");
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [latestRun, setLatestRun] = useState<RunResponse | null>(null);

  useEffect(() => {
    getAgentIdentity()
      .then(setIdentity)
      .catch((err) => setIdentityError(err instanceof Error ? err.message : "unreachable"));
    getIssuerPublicKey()
      .then((res) => setIssuerPublicKey(res.publicKey))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/agent/events");
    source.onmessage = (event) => {
      const step = JSON.parse(event.data) as RunStep;
      setSteps((prev) => [...prev, step]);
    };
    return () => source.close();
  }, []);

  function handleMandateCreated(created: Mandate): void {
    setMandate(created);
    setSteps([]);
    setLatestRun(null);
    setTab("agent");
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-mark" aria-hidden="true" />
          <h1>Agent Passport</h1>
          <span className="app-subtitle">security console</span>
        </div>
        <span className="identity-line">
          {identity
            ? `agent ${identity.agentId} · ${identity.publicKey.slice(0, 20)}…`
            : identityError
              ? `agent service unreachable: ${identityError}`
              : "loading agent identity…"}
        </span>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === "mandate" ? "active" : ""}`} onClick={() => setTab("mandate")}>
          1. Create mandate
        </button>
        <button className={`tab ${tab === "agent" ? "active" : ""}`} disabled={!mandate} onClick={() => setTab("agent")}>
          2. Agent activity
        </button>
        <button className={`tab ${tab === "console" ? "active" : ""}`} disabled={!mandate} onClick={() => setTab("console")}>
          3. Security console
        </button>
      </nav>

      {tab === "mandate" && (
        <CreateMandateScreen
          identity={identity}
          prompt={prompt}
          onPromptChange={setPrompt}
          onCreated={handleMandateCreated}
        />
      )}
      {tab === "agent" && mandate && (
        <AgentActivityScreen
          mandate={mandate}
          prompt={prompt}
          onPromptChange={setPrompt}
          steps={steps}
          onRunStarted={() => {
            setSteps([]);
            setLatestRun(null);
          }}
          onRunFinished={(run) => {
            setLatestRun(run);
            setTab("console");
          }}
        />
      )}
      {tab === "console" && mandate && (
        <SecurityConsoleScreen mandate={mandate} latestRun={latestRun} prompt={prompt} issuerPublicKey={issuerPublicKey} />
      )}
    </div>
  );
}
