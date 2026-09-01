import { parseBudgetRupees, selectProduct, type Product } from "./brain.js";
import { selectProductLLM } from "./llmBrain.js";

export type Brain = "scripted" | "llm";

/** AGENT_BRAIN=llm calls a real model (apps/agent/src/llmBrain.ts); anything else, including unset, keeps the phase-3 scripted brain. */
export function currentBrain(): Brain {
  return process.env.AGENT_BRAIN === "llm" ? "llm" : "scripted";
}

export interface AgentChoice {
  product: Product;
  amountPaise: number;
  quantity: number;
  budgetRupees: number;
  /** True if the chosen amount exceeds the budget parsed from the prompt — the ground-truth "the agent got talked into overspending" signal, defined the same way for both brains. */
  overBudget: boolean;
}

/** Runs whichever brain `brain` selects and returns one common shape run.ts can sign a request from. */
export async function chooseProduct(prompt: string, catalog: Product[], brain: Brain): Promise<AgentChoice> {
  const budgetRupees = parseBudgetRupees(prompt);

  if (brain === "scripted") {
    const selection = selectProduct(prompt, catalog);
    return {
      product: selection.product,
      amountPaise: selection.product.priceRupees * 100,
      quantity: 1,
      budgetRupees,
      overBudget: selection.product.priceRupees > budgetRupees,
    };
  }

  const llmSelection = await selectProductLLM(prompt, catalog);
  return {
    product: llmSelection.product,
    amountPaise: llmSelection.amountPaise,
    quantity: llmSelection.quantity,
    budgetRupees,
    overBudget: llmSelection.amountPaise > budgetRupees * 100,
  };
}
