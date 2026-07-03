import type { Category, CategorySummary, Transaction } from "@/types";

export const TRANSACTIONS_KEY = "finora-transactions";
export const IMPORTS_KEY = "finora-imports";
export const CATEGORIES_KEY = "finora-categories";

export const defaultCategories: Category[] = [
  { id: "default-alimentacao", name: "Alimentacao", type: "expense", color: "#b68432", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "default-transporte", name: "Transporte", type: "expense", color: "#6b8276", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "default-lazer", name: "Lazer", type: "expense", color: "#9b7a47", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "default-saude", name: "Saude", type: "expense", color: "#9a8360", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "default-moradia", name: "Moradia", type: "expense", color: "#164c3d", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "default-outros", name: "Outros", type: "expense", color: "#8a8b82", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "default-renda", name: "Renda", type: "income", color: "#4f8c71", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "default-outras-entradas", name: "Outras entradas", type: "income", color: "#729b88", createdAt: "2025-01-01T00:00:00.000Z" },
];

export const categoryColors: Record<string, string> = {
  "Alimentacao": "#b68432",
  Transporte: "#6b8276",
  Lazer: "#9b7a47",
  Saude: "#9a8360",
  Moradia: "#164c3d",
  Renda: "#4f8c71",
  Outros: "#8a8b82",
};
export const chartColors = Object.values(categoryColors);

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function getStored<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]") as T[]; } catch { return []; }
}

export function setStored<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("finora-storage"));
}

export function getCategories(): Category[] {
  if (typeof window === "undefined") return defaultCategories;
  const saved = getStored<Category>(CATEGORIES_KEY);
  if (saved.length || localStorage.getItem(CATEGORIES_KEY) !== null) return saved;
  setStored<Category>(CATEGORIES_KEY, defaultCategories);
  return defaultCategories;
}

export function transactionMonth(transaction: Transaction): string {
  if (transaction.statementMonth) return transaction.statementMonth;
  const [day, month, year] = transaction.date.split("/").map(Number);
  if (!day || !month || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabel(key: string, short = false): string {
  if (!key) return "";
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: short ? "short" : "long", year: short ? "2-digit" : "numeric",
  }).replace(" de ", " ").replace(".", "");
}

export function previousMonth(key: string): string {
  if (!key) return "";
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function categorySummary(transactions: Transaction[], categories: Category[] = defaultCategories): CategorySummary[] {
  const values = new Map<string, number>();
  transactions.filter((item) => item.type === "expense").forEach((item) => {
    const name = item.category || "Outros";
    values.set(name, (values.get(name) ?? 0) + Number(item.amount));
  });
  return [...values.entries()].map(([name, value], index) => ({
    name, value, color: categories.find((category) => category.name === name)?.color || categoryColors[name] || chartColors[index % chartColors.length],
  })).sort((a, b) => b.value - a.value);
}
