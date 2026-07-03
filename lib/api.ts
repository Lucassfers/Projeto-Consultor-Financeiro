import type { Category, ImportDetails, ImportHistoryItem, Transaction } from "@/types";

interface ImportPayload {
  bank: string;
  fileName: string;
  statementMonth: string | null;
  transactions: Transaction[];
}

async function request<T>(url: string, options?: RequestInit, timeoutMs = 60000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: options?.signal || controller.signal,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    const rawBody = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }
    if (!response.ok) throw new Error(String(body.erro || body.detalhe || rawBody || "Nao foi possivel acessar o banco de dados."));
    return body as T;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw new Error("A consulta demorou demais para responder. Tente novamente ou altere o modelo do OpenRouter.");
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  categories: {
    list: () => request<Category[]>("/api/categories"),
    create: (category: Pick<Category, "name" | "type" | "color">) => request<Category>("/api/categories", { method: "POST", body: JSON.stringify(category) }),
    update: (id: string, category: Pick<Category, "name" | "type" | "color">) => request<Category>(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(category) }),
    remove: (id: string) => request<{ ok: true }>(`/api/categories/${id}`, { method: "DELETE" }),
  },
  imports: {
    list: () => request<ImportHistoryItem[]>("/api/imports"),
    get: (id: string) => request<ImportDetails>(`/api/imports/${id}`),
    create: (payload: ImportPayload) => request<ImportHistoryItem>("/api/imports", { method: "POST", body: JSON.stringify(payload) }),
    updateTransactions: (id: string, transactions: Pick<Transaction, "id" | "category">[]) => request<Transaction[]>(`/api/imports/${id}/transactions`, { method: "PUT", body: JSON.stringify({ transactions }) }),
  },
  transactions: {
    list: () => request<Transaction[]>("/api/transactions"),
  },
  diagnosis: {
    create: (prompt: string) => request<{ modelo: string; resposta: string }>("/api/llm", { method: "POST", body: JSON.stringify({ prompt }) }),
  },
};
