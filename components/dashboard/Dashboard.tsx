"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardChart } from "@/components/charts";
import { Kicker, PageHeading, button, input, panel } from "@/components/ui";
import { categorySummary, formatCurrency, monthLabel, previousMonth, transactionMonth } from "@/lib/store";
import { api } from "@/lib/api";
import type { Category, ImportHistoryItem, Transaction } from "@/types";

interface DashboardProps { onImport: () => void; }
type ChartMode = "bar" | "line";

const IMPORT_DIAGNOSIS_PROMPT = `
Gere um diagnostico financeiro educacional somente para esta importacao.

Arquivo: {fileName}
Banco: {bank}
Periodo: {statementMonth}
Lancamentos: {transactionCount}
Entradas: {income}
Saidas: {expense}
Saldo: {balance}
Gastos por categoria: {categorySummaries}
Maiores gastos: {largestExpenses}

Aponte o diagnostico, os principais pontos de atencao e um plano de acao pratico. Nao invente dados.
Responda em Markdown padronizado, com estes titulos exatos: ## Diagnostico, ## Pontos de atencao, ## Plano de acao, ## Proximos passos.
Em Plano de acao, use uma tabela com as colunas: Etapa | Acao | Prazo.
Nao escreva linhas soltas ou quebradas como | 1 |, | 2 | ou pipes sem cabecalho. Toda tabela deve ter cabecalho completo.
Nao inclua frases finais de aviso legal ou disclaimer profissional.
`.trim();

export default function Dashboard({ onImport }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<ImportHistoryItem[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Category[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedImportId, setSelectedImportId] = useState("");
  const [mode, setMode] = useState<ChartMode>("bar");
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosisError, setDiagnosisError] = useState("");
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    Promise.all([api.transactions.list(), api.imports.list(), api.categories.list()])
      .then(([savedTransactions, savedImports, savedCategories]) => {
        setTransactions(savedTransactions); setImports(savedImports); setCategoryOptions(savedCategories);
        setSelectedImportId(savedImports[0]?.id || "");
      })
      .catch((cause) => setDiagnosisError(cause instanceof Error ? cause.message : "Nao foi possivel carregar os dados."));
  }, []);

  const months = useMemo(() => [...new Set(transactions.map(transactionMonth).filter(Boolean))].sort().reverse(), [transactions]);
  const activeMonth = months.includes(selectedMonth) ? selectedMonth : months[0] || "";
  const filtered = transactions.filter((item) => transactionMonth(item) === activeMonth);
  const incomes = filtered.filter((item) => item.type === "income"), expenses = filtered.filter((item) => item.type === "expense");
  const totalIncome = incomes.reduce((sum, item) => sum + Number(item.amount), 0), totalExpense = expenses.reduce((sum, item) => sum + Number(item.amount), 0), balance = totalIncome - totalExpense;
  const categories = categorySummary(filtered, categoryOptions), allCategories = categorySummary(transactions, categoryOptions), savings = totalIncome ? balance / totalIncome * 100 : 0;
  const previousExpense = transactions.filter((item) => transactionMonth(item) === previousMonth(activeMonth) && item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
  const comparison = previousExpense ? (totalExpense - previousExpense) / previousExpense * 100 : null, top = categories[0];

  const selectedImport = imports.find((item) => item.id === selectedImportId) || imports[0];
  const selectedTransactions = selectedImport ? transactions.filter((item) => item.importId === selectedImport.id) : [];
  const importIncome = selectedTransactions.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
  const importExpense = selectedTransactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);

  async function generateDiagnosis() {
    if (diagnosing) return;
    if (!selectedImport || !selectedTransactions.length) return setDiagnosisError("Esta importacao nao possui transacoes disponiveis para analise.");
    setDiagnosing(true); setDiagnosis(""); setDiagnosisError("");
    const summaries = categorySummary(selectedTransactions, categoryOptions).slice(0, 8).map((item) => `${item.name}: ${formatCurrency(item.value)}`).join("; ");
    const largest = selectedTransactions.filter((item) => item.type === "expense").sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 8).map((item) => `${item.description} (${formatCurrency(item.amount)}, ${item.category || "Sem categoria"})`).join("; ");
    const prompt = IMPORT_DIAGNOSIS_PROMPT
      .replace("{fileName}", selectedImport.fileName)
      .replace("{bank}", selectedImport.bank)
      .replace("{statementMonth}", selectedImport.statementMonth || "nao informado")
      .replace("{transactionCount}", String(selectedTransactions.length))
      .replace("{income}", formatCurrency(importIncome))
      .replace("{expense}", formatCurrency(importExpense))
      .replace("{balance}", formatCurrency(importIncome - importExpense))
      .replace("{categorySummaries}", summaries || "sem categorias")
      .replace("{largestExpenses}", largest || "nenhum")
      .slice(0, 1600);
    try { const result = await api.diagnosis.create(prompt); setDiagnosis(result.resposta); }
    catch (cause) { setDiagnosisError(cause instanceof Error ? cause.message : "Nao foi possivel gerar o diagnostico."); }
    finally { setDiagnosing(false); }
  }

  return <>
    <PageHeading eyebrow="Dashboard financeiro" title="Sua vida financeira, em perspectiva." aside={<label className="text-xs font-bold text-muted">Periodo analisado<select className="mt-2 block min-h-11 rounded-xl border border-line bg-panel px-4 text-ink" value={activeMonth} onChange={(event) => setSelectedMonth(event.target.value)} disabled={!months.length}>{months.length ? months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>) : <option>Nenhum periodo</option>}</select></label>}>Acompanhe entradas, saidas e a evolucao das categorias a partir dos documentos importados.</PageHeading>
    <section className={`${panel} mb-5 grid overflow-hidden sm:grid-cols-4`}><Toolbar label="Documentos" value={imports.length} /><Toolbar label="Lancamentos" value={transactions.length} /><Toolbar label="Categorias" value={allCategories.length} /><button onClick={onImport} className="min-h-20 bg-accent px-5 text-sm font-bold text-white">Importar extrato →</button></section>

    <section className={`${panel} mb-5 overflow-hidden`}>
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_320px] md:p-7">
        <div><Kicker>Diagnostico com IA</Kicker><h2 className="font-serif text-2xl">Analise uma importacao especifica</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-muted">Escolha um documento. A IA recebera somente o resumo dos lancamentos revisados dessa importacao.</p></div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Importacao<select className={`${input} mt-2`} value={selectedImport?.id || ""} disabled={!imports.length || diagnosing} onChange={(event) => { setSelectedImportId(event.target.value); setDiagnosis(""); setDiagnosisError(""); }}>{imports.length ? imports.map((item) => <option key={item.id} value={item.id}>{item.fileName}{item.statementMonth ? ` · ${monthLabel(item.statementMonth)}` : ""}</option>) : <option value="">Nenhuma importacao</option>}</select></label>
      </div>
      {selectedImport ? <>
        <div className="grid border-t border-line sm:grid-cols-3"><DiagnosisMetric label="Entradas" value={formatCurrency(importIncome)} /><DiagnosisMetric label="Saidas" value={formatCurrency(importExpense)} /><DiagnosisMetric label="Saldo" value={formatCurrency(importIncome - importExpense)} /></div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-panel-soft p-5"><p className="text-xs text-muted">{selectedTransactions.length} lancamentos de {selectedImport.fileName}</p><button className={button} disabled={diagnosing || !selectedTransactions.length} onClick={generateDiagnosis}>{diagnosing ? "Analisando..." : "Gerar diagnostico financeiro →"}</button></div>
      </> : <div className="border-t border-line p-8 text-center"><p className="text-sm text-muted">Importe um extrato para liberar o diagnostico.</p><button onClick={onImport} className="mt-3 text-sm font-bold text-accent">Fazer importacao →</button></div>}
      {diagnosisError && <p className="m-5 rounded-xl bg-gold-soft p-4 text-xs text-amber-900">{diagnosisError}</p>}
      {diagnosis && <article className="border-t border-line p-5 md:p-7"><Kicker>Analise gerada</Kicker><FormattedDiagnosis text={diagnosis} /><p className="mt-5 text-[10px] text-muted">Conteudo educacional. Nao substitui orientacao financeira profissional.</p></article>}
    </section>

    <section className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Saldo do mes" value={formatCurrency(balance)} detail={filtered.length ? `${filtered.length} lancamentos` : "Nenhum lancamento"} featured /><Metric label="Entradas" value={formatCurrency(totalIncome)} detail={`${incomes.length} lancamentos`} tone="text-emerald-700" /><Metric label="Saidas" value={formatCurrency(totalExpense)} detail={`${expenses.length} lancamentos`} tone="text-amber-700" /><Metric label="Taxa de economia" value={`${savings.toFixed(1)}%`} detail="Calculada sobre as entradas" /></section>
    <section className="mb-5 grid gap-4 lg:grid-cols-3"><Insight number="01" label="Gastos vs. mes anterior" value={comparison === null ? "Sem comparacao" : `${Math.abs(comparison).toFixed(1)}% ${comparison > 0 ? "acima" : "abaixo"}`} detail={comparison === null ? "Importe mais de um mes para comparar." : `Em relacao a ${monthLabel(previousMonth(activeMonth))}.`} /><Insight number="02" label="Maior categoria" value={top?.name || "Nenhuma"} detail={top ? `${formatCurrency(top.value)} no periodo.` : "Ainda nao ha saidas categorizadas."} /><Insight number="03" label="Leitura rapida" value={!filtered.length ? "Aguardando seus dados" : balance >= 0 ? "O mes fechou positivo" : "As saidas superaram as entradas"} detail={!filtered.length ? "As importacoes confirmadas alimentam esta visao." : balance >= 0 ? "Continue acompanhando a distribuicao dos gastos." : "Revise as maiores categorias para recuperar o equilibrio."} /></section>
    <section className={`${panel} mb-10 p-5 md:p-7`}><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><Kicker>Analise visual</Kicker><h2 className="font-serif text-2xl">{mode === "bar" ? "Saidas por categoria" : "Evolucao das saidas"}</h2><p className="mt-1 text-xs text-muted">{mode === "bar" ? "Distribuicao dos gastos no periodo selecionado." : "Comparativo ao longo dos meses importados."}</p></div><div className="flex rounded-lg bg-panel-soft p-1">{([['bar','Barras'],['line','Linhas']] as Array<[ChartMode, string]>).map(([value,label]) => <button key={value} onClick={() => setMode(value)} className={`rounded-md px-4 py-2 text-xs font-bold ${mode === value ? "bg-white shadow-sm" : "text-muted"}`}>{label}</button>)}</div></div>{filtered.length ? <DashboardChart mode={mode} categories={mode === "line" ? allCategories : categories} months={months} transactions={transactions} /> : <div className="grid min-h-80 place-items-center rounded-xl border border-dashed border-line bg-panel-soft text-center"><div><span className="text-3xl text-gold">◫</span><h3 className="mt-3 font-serif text-xl">O grafico nasce das suas importacoes</h3><p className="mt-2 text-sm text-muted">Importe e confirme um extrato para visualizar seus gastos.</p><button onClick={onImport} className="mt-4 text-sm font-bold text-accent">Fazer primeira importacao →</button></div></div>}</section>
    <section><div className="mb-5 flex flex-wrap justify-between gap-3"><div><Kicker>Categorias</Kicker><h2 className="font-serif text-2xl">Media mensal por categoria</h2></div><p className="text-xs text-muted">Calculada sobre {months.length} meses importados.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{allCategories.length ? allCategories.map((item) => <article key={item.name} className={`${panel} p-5`}><span className="mb-5 block h-1 w-10 rounded-full" style={{ background: item.color }} /><p className="text-xs font-bold text-muted">{item.name}</p><strong className="mt-2 block font-serif text-xl">{formatCurrency(item.value / Math.max(months.length, 1))}</strong><small className="text-[10px] text-muted">media por mes</small></article>) : <p className="col-span-full rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">As categorias aparecerao depois da primeira importacao.</p>}</div></section>
  </>;
}

interface ToolbarProps { label: string; value: number; }
interface MetricProps { label: string; value: string; detail: string; featured?: boolean; tone?: string; }
interface InsightProps { number: string; label: string; value: string; detail: string; }
function Toolbar({ label, value }: ToolbarProps) { return <div className="flex min-h-20 items-center justify-between border-b border-line px-5 sm:border-b-0 sm:border-r"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="font-serif text-xl">{value}</strong></div>; }
function DiagnosisMetric({ label, value }: Readonly<{ label: string; value: string }>) { return <div className="flex items-center justify-between border-b border-line px-5 py-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="font-serif text-lg">{value}</strong></div>; }
function Metric({ label, value, detail, featured, tone = "" }: MetricProps) { return <article className={`${panel} p-5 ${featured ? "bg-ink text-white" : ""}`}><span className={`text-[10px] font-bold uppercase tracking-wider ${featured ? "text-white/60" : "text-muted"}`}>{label}</span><strong className={`mt-3 block font-serif text-2xl ${tone}`}>{value}</strong><small className={featured ? "text-white/60" : "text-muted"}>{detail}</small></article>; }
function Insight({ number, label, value, detail }: InsightProps) { return <article className={`${panel} p-5`}><span className="text-[10px] font-black tracking-widest text-gold">{number}</span><p className="mt-4 text-xs font-bold text-muted">{label}</p><strong className="mt-2 block font-serif text-xl">{value}</strong><small className="mt-2 block leading-5 text-muted">{detail}</small></article>; }

type DiagnosisItem =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; rows: string[][] };
type DiagnosisSection = { title: string; items: DiagnosisItem[] };

function normalizeDiagnosisText(text: string) {
  return String(text).replace(/([0-9])\ufe0f?\u20e3/g, "$1").replace(/<br\s*\/?>/gi, "\n");
}

function cleanDiagnosisTitle(title: string) {
  return title.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").replace(/:$/, "").trim();
}

function normalizeTitleKey(title: string) {
  return cleanDiagnosisTitle(title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeTableRows(rows: string[][]) {
  const usefulRows = rows
    .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 1 || !/^\d+[.)]?$/.test(row[0] || ""));
  if (!usefulRows.length) return [];

  const maxColumns = Math.max(...usefulRows.map((row) => row.length));
  const hasHeader = usefulRows[0].some((cell) => /[a-zA-ZÀ-ÿ]/.test(cell)) && !/^\d+[.)]?$/.test(usefulRows[0][0] || "");
  const headersBySize: Record<number, string[]> = {
    2: ["Etapa", "Acao"],
    3: ["Item", "Analise", "Recomendacao"],
  };
  const normalizedRows = usefulRows.map((row) => {
    const nextRow = [...row];
    while (nextRow.length < maxColumns) nextRow.push("");
    return nextRow;
  });

  return hasHeader ? normalizedRows : [headersBySize[maxColumns] || Array.from({ length: maxColumns }, (_, index) => `Coluna ${index + 1}`), ...normalizedRows];
}

function parseDiagnosis(text: string): DiagnosisSection[] {
  const sections: DiagnosisSection[] = [];
  let current: DiagnosisSection | null = null;
  let tableRows: string[][] = [];

  const ensureSection = () => {
    if (!current) {
      current = { title: "Analise financeira", items: [] };
      sections.push(current);
    }
    return current;
  };
  const flushTable = () => {
    const rows = normalizeTableRows(tableRows);
    if (rows.length) ensureSection().items.push({ kind: "table", rows });
    tableRows = [];
  };

  normalizeDiagnosisText(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const cleanLine = line.replace(/^[-–—]{2,}$/, "").trim();
    if (!cleanLine) return;

    const isTitle = /^#{1,3}\s+/.test(cleanLine) || (/^\*\*.+\*\*$/.test(cleanLine) && cleanLine.length < 90);
    if (isTitle) {
      flushTable();
      current = { title: cleanDiagnosisTitle(cleanLine), items: [] };
      sections.push(current);
      return;
    }

    if (/^\|.+\|$/.test(cleanLine)) {
      const cells = cleanLine.split("|").map((cell) => cell.trim()).filter(Boolean);
      const isDivider = cells.every((cell) => /^:?-{2,}:?$/.test(cell));
      if (!isDivider && cells.length) tableRows.push(cells);
      return;
    }

    flushTable();
    const section = ensureSection();
    const numbered = cleanLine.match(/^(\d+)[.)]\s*(.+)$/);
    if (numbered && (normalizeTitleKey(section.title).includes("plano") || normalizeTitleKey(section.title).includes("proximos"))) {
      const last = section.items.at(-1);
      if (last?.kind === "table" && last.rows[0]?.join("|") === "Etapa|Acao") last.rows.push([numbered[1], numbered[2]]);
      else section.items.push({ kind: "table", rows: [["Etapa", "Acao"], [numbered[1], numbered[2]]] });
      return;
    }

    if (/^[-*]\s+/.test(cleanLine) || numbered) {
      const value = cleanLine.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s*/, "");
      const last = section.items.at(-1);
      if (last?.kind === "list") last.items.push(value);
      else section.items.push({ kind: "list", items: [value] });
      return;
    }

    section.items.push({ kind: "paragraph", text: cleanLine });
  });

  flushTable();
  return sections;
}

function inlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => (
    part.startsWith("**") && part.endsWith("**") ? <strong key={index} className="font-extrabold text-ink">{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>
  ));
}

function columnClass(rows: string[][], cellIndex: number, rowIndex: number) {
  const header = normalizeTitleKey(rows[0]?.[cellIndex] || "");
  const isStrongGreenColumn = header === "etapa" || header === "item";
  const isStrongGreenHeader = header === "classe de investimento";
  if (isStrongGreenColumn || (rowIndex === 0 && isStrongGreenHeader)) return "font-black text-accent";
  return "";
}

function tableCellClass(rows: string[][], cellIndex: number, rowIndex: number) {
  const emphasis = columnClass(rows, cellIndex, rowIndex);
  const firstColumn = cellIndex === 0 ? `w-16 text-center font-extrabold ${emphasis ? "" : "text-muted"}` : "";
  return `p-3 align-top text-[#31483f] ${firstColumn} ${emphasis}`;
}

function FormattedDiagnosis({ text }: Readonly<{ text: string }>) {
  const sections = parseDiagnosis(text);
  return <div className="mt-3 grid gap-4 text-sm leading-7 text-ink">
    {sections.map((section, sectionIndex) => <section key={`${section.title}-${sectionIndex}`} className="rounded-xl border border-line bg-panel-soft p-5">
      <h3 className="font-serif text-2xl text-accent">{section.title}</h3>
      <div className="mt-3 grid gap-3">
        {section.items.map((item, itemIndex) => {
          if (item.kind === "paragraph") return <p key={itemIndex} className="text-[#31483f]">{inlineText(item.text)}</p>;
          if (item.kind === "list") return <ol key={itemIndex} className="grid list-decimal gap-2 pl-5 text-[#31483f]">{item.items.map((value, index) => <li key={`${value}-${index}`}>{inlineText(value)}</li>)}</ol>;
          return <div key={itemIndex} className="overflow-x-auto rounded-lg border border-line bg-white"><table className="w-full min-w-[520px] border-collapse text-xs"><tbody>{item.rows.map((row, rowIndex) => <tr key={`${row.join("|")}-${rowIndex}`} className="border-b border-line last:border-b-0">{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex} className={`bg-accent-soft p-3 text-left text-[10px] font-black uppercase tracking-wider text-accent first:w-16 first:text-center ${columnClass(item.rows, cellIndex, rowIndex)}`}>{inlineText(cell)}</th> : <td key={cellIndex} className={tableCellClass(item.rows, cellIndex, rowIndex)}>{inlineText(cell)}</td>)}</tr>)}</tbody></table></div>;
        })}
      </div>
    </section>)}
  </div>;
}
