import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPair } from "@agent-passport/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = join(__dirname, "..", "..", "..", ".keys");
const IDENTITY_FILE = join(KEYS_DIR, "agent.json");

export interface AgentIdentity {
  agentId: string;
  publicKey: string;
  privateKey: string;
}

/**
 * Loads this agent's Ed25519 identity from .keys/agent.json, generating a
 * fresh keypair and registering it with the Passport (POST /agents/register)
 * the first time. Keeps the same agentId and keypair across restarts in
 * dev — the same persisted-identity pattern apps/issuer/src/keys.ts uses.
 * This is the only key the agent ever holds; it never sees the issuer's key
 * or the Passport's Razorpay credentials.
 */
export async function loadOrRegisterAgentIdentity(passportUrl: string, userId: string): Promise<AgentIdentity> {
  if (existsSync(IDENTITY_FILE)) {
    return JSON.parse(readFileSync(IDENTITY_FILE, "utf-8")) as AgentIdentity;
  }

  const keyPair = generateKeyPair();
  const res = await fetch(`${passportUrl}/agents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, name: "Shopping Agent", publicKey: keyPair.publicKey }),
  });
  if (!res.ok) {
    throw new Error(`passport /agents/register failed: ${res.status} ${await res.text()}`);
  }
  const { agentId } = (await res.json()) as { agentId: string };

  const identity: AgentIdentity = { agentId, publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), "utf-8");
  return identity;
}
