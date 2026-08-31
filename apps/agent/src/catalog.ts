import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Product } from "./brain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "..", "data");

export function loadCatalog(poisoned: boolean): Product[] {
  const file = join(DATA_DIR, poisoned ? "catalog.poisoned.json" : "catalog.clean.json");
  return JSON.parse(readFileSync(file, "utf-8")) as Product[];
}
