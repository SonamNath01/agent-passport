import {
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createPublicKey,
  createPrivateKey,
  type KeyObject,
} from "node:crypto";
import { canonicalize, toBytes, withoutField } from "./canonical.js";

export interface KeyPairBase64 {
  publicKey: string;
  privateKey: string;
}

export function generateKeyPair(): KeyPairBase64 {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

function loadPublicKey(publicKeyBase64: string): KeyObject {
  return createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
}

function loadPrivateKey(privateKeyBase64: string): KeyObject {
  return createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
}

/**
 * Signs the canonical form of `payload` with `field` excluded (the field the
 * signature itself will be stored in). Callers assemble the full signed object
 * by spreading `payload` and adding `[field]: signature`.
 */
export function signPayload<T extends object, K extends keyof T>(
  payload: T,
  field: K,
  privateKeyBase64: string,
): string {
  const canonical = canonicalize(withoutField(payload, field));
  const signature = edSign(null, toBytes(canonical), loadPrivateKey(privateKeyBase64));
  return signature.toString("base64");
}

/**
 * Verifies `payload[field]` against the canonical form of the rest of `payload`.
 * Never throws: any malformed key/signature/payload resolves to `false` so
 * callers can fail closed without their own try/catch.
 */
export function verifyPayload<T extends object, K extends keyof T>(
  payload: T,
  field: K,
  publicKeyBase64: string,
): boolean {
  try {
    const signatureBase64 = payload[field];
    if (typeof signatureBase64 !== "string" || signatureBase64.length === 0) {
      return false;
    }
    const canonical = canonicalize(withoutField(payload, field));
    return edVerify(
      null,
      toBytes(canonical),
      loadPublicKey(publicKeyBase64),
      Buffer.from(signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}
