import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPair, type KeyPairBase64 } from "@agent-passport/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = join(__dirname, "..", "..", "..", ".keys");
const KEYS_FILE = join(KEYS_DIR, "issuer.json");

/**
 * Loads the issuer's Ed25519 keypair from env (ISSUER_PUBLIC_KEY / ISSUER_PRIVATE_KEY,
 * base64 DER), falling back to a persisted file in .keys/, generating a fresh
 * keypair the first time. Keeps the same identity across restarts in dev.
 */
export function loadOrCreateIssuerKeyPair(): KeyPairBase64 {
  if (process.env.ISSUER_PUBLIC_KEY && process.env.ISSUER_PRIVATE_KEY) {
    return {
      publicKey: process.env.ISSUER_PUBLIC_KEY,
      privateKey: process.env.ISSUER_PRIVATE_KEY,
    };
  }

  if (existsSync(KEYS_FILE)) {
    const raw = readFileSync(KEYS_FILE, "utf-8");
    return JSON.parse(raw) as KeyPairBase64;
  }

  const keyPair = generateKeyPair();
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(keyPair, null, 2), "utf-8");
  return keyPair;
}
