// Deterministic serialisation used on both sides of every signature: recursively
// sort object keys, reject floats (money is integer paise, everything else is a
// string/int/bool), and produce compact JSON with no insignificant whitespace.

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`canonicalize: non-integer number is not allowed (${value})`);
    }
  }

  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function toBytes(canonical: string): Uint8Array {
  return new TextEncoder().encode(canonical);
}

/** Returns a shallow copy of `obj` with `field` removed, for signing/verifying payloads that carry their own signature. */
export function withoutField<T extends object, K extends keyof T>(obj: T, field: K): Omit<T, K> {
  const { [field]: _omitted, ...rest } = obj;
  return rest;
}
