import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/canonical.js";
import { generateKeyPair, signPayload, verifyPayload } from "../src/crypto.js";
import type { UnsignedMandate, Mandate } from "../src/types.js";

function sampleUnsignedMandate(): UnsignedMandate {
  return {
    mandateId: "mandate_1",
    userId: "user_1",
    agentId: "agent_1",
    maxAmountPaise: 500000,
    currency: "INR",
    cumulativeLimitPaise: 1000000,
    windowHours: 24,
    category: "FOOTWEAR",
    maxQuantity: 1,
    merchantAllowlist: ["merchant_b", "merchant_a"],
    destination: "upi://merchant@bank",
    issuedAt: "2026-08-27T00:00:00.000Z",
    expiresAt: "2026-08-28T00:00:00.000Z",
    nonce: "nonce_1",
  };
}

describe("canonicalize", () => {
  it("sorts keys regardless of insertion order", () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  it("sorts nested object keys and array element keys", () => {
    const a = canonicalize({ z: { d: 1, c: 2 }, list: [{ y: 1, x: 2 }] });
    const b = canonicalize({ list: [{ x: 2, y: 1 }], z: { c: 2, d: 1 } });
    expect(a).toBe(b);
  });

  it("rejects non-integer numbers", () => {
    expect(() => canonicalize({ amountPaise: 100.5 })).toThrow();
  });

  it("produces no insignificant whitespace", () => {
    expect(canonicalize({ a: 1, b: [1, 2] })).toBe('{"a":1,"b":[1,2]}');
  });
});

describe("signPayload / verifyPayload round trip", () => {
  it("verifies a correctly signed mandate", () => {
    const { publicKey, privateKey } = generateKeyPair();
    const unsigned = sampleUnsignedMandate();
    const issuerSignature = signPayload(
      { ...unsigned, issuerSignature: "" } as Mandate,
      "issuerSignature",
      privateKey,
    );
    const mandate: Mandate = { ...unsigned, issuerSignature };

    expect(verifyPayload(mandate, "issuerSignature", publicKey)).toBe(true);
  });

  it("fails verification when any signed field is mutated after signing", () => {
    const { publicKey, privateKey } = generateKeyPair();
    const unsigned = sampleUnsignedMandate();
    const issuerSignature = signPayload(
      { ...unsigned, issuerSignature: "" } as Mandate,
      "issuerSignature",
      privateKey,
    );
    const mandate: Mandate = { ...unsigned, issuerSignature };

    const tampered: Mandate = { ...mandate, maxAmountPaise: 999_999_999 };

    expect(verifyPayload(tampered, "issuerSignature", publicKey)).toBe(false);
  });

  it("fails verification against a different signer's public key", () => {
    const signer = generateKeyPair();
    const attacker = generateKeyPair();
    const unsigned = sampleUnsignedMandate();
    const issuerSignature = signPayload(
      { ...unsigned, issuerSignature: "" } as Mandate,
      "issuerSignature",
      signer.privateKey,
    );
    const mandate: Mandate = { ...unsigned, issuerSignature };

    expect(verifyPayload(mandate, "issuerSignature", attacker.publicKey)).toBe(false);
  });
});
