export type PageName = "importacoes" | "categorias";
export type TransactionType = "income" | "expense" | "ignored";
export type CategoryType = "income" | "expense";
export type Bank = "nubank" | "banco-do-brasil";


export interface Transaction {
  id: string;
  importId?: string | null;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  confidence: number;
  statementMonth?: string | null;
  sourceFile?: string;
  importedAt?: string;
  bank?: Bank;
}

export interface StatementImport {
  bank: Bank;
  transactions: Transaction[];
  statementMonth: string | null;
  statementTotal: number | null;
}

export interface ImportHistoryItem {
  id: string;
  fileName: string;
  bank: Bank;
  statementMonth: string | null;
  transactionCount: number;
  total: number;
  createdAt: string;
}

export interface ImportDetails extends ImportHistoryItem {
  transactions: Transaction[];
}

export interface CategorySummary {
  name: string;
  value: number;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  createdAt: string;
}

export interface ImportProgress {
  message: string;
  percent: number;
}
