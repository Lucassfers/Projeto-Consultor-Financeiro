import type { Bank, StatementImport, Transaction } from "@/types";

const monthNumbers: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/[R$\s]/gi, "").replace(/\./g, "").replace("−", "-");
  if (cleaned.includes(",")) return Number(cleaned.replace(",", "."));
  if (/^-?\d{3,}$/.test(cleaned)) return Number(`${cleaned.slice(0, -2)}.${cleaned.slice(-2)}`);
  return Number(cleaned);
}

function expandDate(value: string): string {
  if (value.split("/").length === 3) return value;
  const month = Number(value.split("/")[1]);
  const now = new Date();
  const year = month > now.getMonth() + 2 ? now.getFullYear() - 1 : now.getFullYear();
  return `${value}/${year}`;
}

function unique(items: Transaction[]): Transaction[] {
  return items.filter((item, index, all) => index === all.findIndex((candidate) =>
    candidate.date === item.date && candidate.description === item.description && candidate.amount === item.amount
  ));
}

export function guessCategory(description: string): string {
  const value = normalize(description.toLocaleLowerCase("pt-BR"));
  if (/mercado|super|atacad|restaur|lanch|ifood|padaria/.test(value)) return "Alimentacao";
  if (/uber|99 |posto|combust|metro|onibus/.test(value)) return "Transporte";
  if (/netflix|spotify|cinema|steam|ingresso/.test(value)) return "Lazer";
  if (/farmacia|hospital|clinica/.test(value)) return "Saude";
  if (/aluguel|condominio|energia|agua|internet/.test(value)) return "Moradia";
  if (/salario|pix recebido|deposito/.test(value)) return "Renda";
  return "Outros";
}

function getStatementMonth(text: string): string | null {
  const match = normalize(text).match(/\bFATURA\s+\d{2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})\b/i);
  return match ? `${match[2]}-${String(monthNumbers[match[1].toUpperCase()]).padStart(2, "0")}` : null;
}

function getStatementTotal(text: string): number | null {
  const match = normalize(text).match(/\bTOTAL DA FATURA\s+(?:BR\s+)?R\$\s*([\d.]+,\d{2})/i)
    || normalize(text).match(/\bTOTAL A PAGAR:?\s*R\$\s*([\d.]+,\d{2})/i);
  return match ? parseAmount(match[1]) : null;
}

function parseGeneric(text: string): Transaction[] {
  const transactions: Transaction[] = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
    const dateMatch = line.match(/^\s*(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+)$/);
    const amountMatch = line.match(/(-?\s*(?:R\s?\$|\$)?\s*[\d.]+(?:,\d{2})?)\s*$/i);
    if (!dateMatch || !amountMatch || (!amountMatch[1].includes(",") && !/R\s?\$/i.test(amountMatch[1]))) return;
    const rawAmount = parseAmount(amountMatch[1]);
    const description = dateMatch[2].slice(0, dateMatch[2].lastIndexOf(amountMatch[1])).replace(/\s+(?:BR\s*)?(?:R\s?\$)?\s*$/i, "").trim();
    if (!description || /^(TOTAL DA FATURA|TOTAL A PAGAR|SALDO FATURA)$/i.test(normalize(description))) return;
    const ignored = rawAmount < 0 && /^(PAGTO|PGTO|PAGAMENTO)\b/i.test(description);
    const income = rawAmount < 0 || /CREDITO|ESTORNO|RECEBIDO/i.test(normalize(description));
    transactions.push({ id: crypto.randomUUID(), date: expandDate(dateMatch[1]), description, amount: Math.abs(rawAmount), type: ignored ? "ignored" : income ? "income" : "expense", category: guessCategory(description), confidence: amountMatch[1].includes(",") ? 0.86 : 0.6 });
  });
  return unique(transactions);
}

function parseNubank(text: string): Transaction[] {
  const statementMonth = getStatementMonth(text);
  const statementYear = Number(statementMonth?.slice(0, 4)) || new Date().getFullYear();
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[|]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  const transactions: Transaction[] = [];
  let inTransactions = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^TRANSACOES$/i.test(normalize(line))) { inTransactions = true; continue; }
    if (!inTransactions) continue;
    const dateMatch = line.match(/\b(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/i);
    if (!dateMatch) continue;
    const joined = [line.slice(0, dateMatch.index), line.slice((dateMatch.index || 0) + dateMatch[0].length), lines[index + 1] || ""].join(" ");
    const amountMatch = joined.match(/([−-]?\s*R\$\s*[\d.]+,\d{2})/i);
    if (!amountMatch) continue;
    const rawAmount = parseAmount(amountMatch[1]);
    const description = joined.slice(0, joined.indexOf(amountMatch[1])).replace(/^[•·]+\s*\d{4}\s*/, "").trim();
    const month = monthNumbers[dateMatch[2].toUpperCase()];
    const year = statementMonth && month > Number(statementMonth.slice(5, 7)) ? statementYear - 1 : statementYear;
    if (description) transactions.push({ id: crypto.randomUUID(), date: `${dateMatch[1]}/${String(month).padStart(2, "0")}/${year}`, description, amount: Math.abs(rawAmount), type: rawAmount < 0 || /^Pagamento em /i.test(description) ? "income" : "expense", category: guessCategory(description), confidence: 0.98 });
  }
  return unique(transactions);
}

export function parseStatement(text: string, preferredBank: Bank = "nubank"): StatementImport {
  const normalized = normalize(text);
  const bank: Bank = /\bNUBANK\b/i.test(normalized) || /^TRANSACOES$/im.test(normalized) ? "nubank" : /\bBANCO DO BRASIL\b|\bOUROCARD\b/i.test(normalized) ? "banco-do-brasil" : preferredBank;
  const parsed = bank === "nubank" ? parseNubank(text) : parseGeneric(text);
  const transactions = parsed.length ? parsed : parseGeneric(text);
  const latestDate = transactions.map((item) => item.date.split("/").map(Number)).sort((a, b) => b[2] - a[2] || b[1] - a[1])[0];
  return { bank, transactions, statementMonth: bank === "nubank" ? getStatementMonth(text) : latestDate ? `${latestDate[2]}-${String(latestDate[1]).padStart(2, "0")}` : null, statementTotal: getStatementTotal(text) };
}

export async function readDocument(file: File, onProgress: (message: string, percent: number) => void): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Lendo pagina ${pageNumber} de ${pdf.numPages}`, Math.round(pageNumber / pdf.numPages * 90));
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const rows = new Map<number, Array<{ x: number; text: string }>>();
      content.items.forEach((item) => {
        if (!("str" in item)) return;
        const y = Math.round(item.transform[5] / 3) * 3;
        const row = rows.get(y) || [];
        row.push({ x: item.transform[4], text: item.str });
        rows.set(y, row);
      });
      pages.push([...rows.entries()].sort(([a], [b]) => b - a).map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ")).join("\n"));
    }
    onProgress("Documento lido", 100);
    return pages.join("\n");
  }
  onProgress("Reconhecendo texto da imagem", 10);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, { logger: (event) => {
    if (event.status === "recognizing text") onProgress("Reconhecendo texto", Math.round(event.progress * 100));
  } });
  try { return (await worker.recognize(file)).data.text; } finally { await worker.terminate(); }
}
