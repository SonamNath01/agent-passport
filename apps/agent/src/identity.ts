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
 *
 * The identity file lives on the host filesystem and survives a
 * `docker compose down -v`; the Passport's agent table does not. Chose to
 * have the agent re-register itself (over the alternative of the seed
 * script adopting whatever the agent already has, or the agent adopting a
 * fixed seeded id) because it needs zero coordination with prisma/seed.ts —
 * the agent is the one piece of state that both sides depend on, so it's
 * the one place that can tell it's gone stale and put itself right.
 */
export async function loadOrRegisterAgentIdentity(passportUrl: string, userId: string): Promise<AgentIdentity> {
  if (existsSync(IDENTITY_FILE)) {
    const identity = JSON.parse(readFileSync(IDENTITY_FILE, "utf-8")) as AgentIdentity;
    const check = await fetch(`${passportUrl}/agents/${identity.agentId}`);
    if (check.ok) {
      return identity;
    }
    if (check.status !== 404) {
      throw new Error(`passport GET /agents/${identity.agentId} failed: ${check.status} ${await check.text()}`);
    }
    // A wiped Passport DB no longer knows this agentId — re-register the same
    // id and keypair rather than minting a new identity, so the file on disk
    // never has to change.
    await registerIdentity(passportUrl, userId, identity.publicKey, identity.agentId);
    return identity;
  }

  const keyPair = generateKeyPair();
  const agentId = await registerIdentity(passportUrl, userId, keyPair.publicKey);

  const identity: AgentIdentity = { agentId, publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), "utf-8");
  return identity;
}

async function registerIdentity(
  passportUrl: string,
  userId: string,
  publicKey: string,
  agentId?: string,
): Promise<string> {
  const res = await fetch(`${passportUrl}/agents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId, userId, name: "Shopping Agent", publicKey }),
  });
  if (!res.ok) {
    throw new Error(`passport /agents/register failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { agentId: string };
  return body.agentId;
}
