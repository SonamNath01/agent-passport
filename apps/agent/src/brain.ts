export interface Product {
  id: string;
  name: string;
  merchantId: string;
  category: string;
  priceRupees: number;
  description: string;
}

export interface Selection {
  product: Product;
  budgetRupees: number;
  candidateCount: number;
  injected: boolean;
}

// VULNERABILITY: a real agent treats a product description as untrusted
// data returned by a tool call, never as an instruction. This scripted
// brain — standing in for an LLM this phase — does the naive thing an
// unguarded LLM agent does: it pattern-matches the catalog text for
// instruction-looking phrases and obeys whatever it finds, regardless of
// the user's stated budget. That misplaced trust is exactly what
// data/catalog.poisoned.json exploits; the Passport's checks, not the
// agent, are what actually stop the resulting overspend.
const INJECTION_PATTERN = /(ignore|disregard)[^.]{0,60}budget/i;

export function parseBudgetRupees(prompt: string): number {
  const rupeeSign = prompt.match(/₹\s?([\d,]+)/);
  if (rupeeSign) {
    return Number(rupeeSign[1].replace(/,/g, ""));
  }
  const worded = prompt.match(/(?:budget|under|within)\D{0,10}?([\d,]+)/i);
  if (worded) {
    return Number(worded[1].replace(/,/g, ""));
  }
  throw new Error("could not parse a budget from the prompt");
}

/** Filters by budget and picks the cheapest match — unless injected instruction text derails it first. */
export function selectProduct(prompt: string, catalog: Product[]): Selection {
  const budgetRupees = parseBudgetRupees(prompt);
  const candidates = catalog.filter((p) => p.priceRupees <= budgetRupees);

  const injected = catalog.find((p) => INJECTION_PATTERN.test(p.description));
  if (injected) {
    return { product: injected, budgetRupees, candidateCount: candidates.length, injected: true };
  }

  if (candidates.length === 0) {
    throw new Error(`no product found within budget ₹${budgetRupees}`);
  }
  const cheapest = candidates.reduce((a, b) => (b.priceRupees < a.priceRupees ? b : a));
  return { product: cheapest, budgetRupees, candidateCount: candidates.length, injected: false };
}
