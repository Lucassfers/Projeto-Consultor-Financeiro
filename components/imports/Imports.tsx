"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { readDocument, parseStatement } from "@/lib/importer";
import { formatCurrency, monthLabel } from "@/lib/store";
import { api } from "@/lib/api";
import { Kicker, PageHeading, Step, button, input, panel } from "@/components/ui";
import type { Bank, Category, ImportHistoryItem, ImportProgress, StatementImport, Transaction, TransactionType } from "@/types";
const emptyImport = (bank: Bank = "nubank"): StatementImport => ({ transactions: [], statementMonth: null, statementTotal: null, bank });
export default function Imports() {
    const fileInput = useRef<HTMLInputElement>(null);
    const [bank, setBank] = useState<Bank>("nubank"), [file, setFile] = useState<File | null>(null), [current, setCurrent] = useState<StatementImport>(emptyImport()), [history, setHistory] = useState<ImportHistoryItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [progress, setProgress] = useState<ImportProgress | null>(null), [error, setError] = useState(""), [saved, setSaved] = useState(false), [dragging, setDragging] = useState(false);
    useEffect(() => { Promise.all([api.imports.list(), api.categories.list()]).then(([savedImports, savedCategories]) => { setHistory(savedImports); setCategories(savedCategories); }).catch((cause) => setError(cause.message)); }, []);
    function chooseFile(selected?: File): void { if (!selected)
        return; setFile(selected); setCurrent(emptyImport(bank)); setSaved(false); setError(""); }
    function clearFile(): void { setFile(null); setCurrent(emptyImport(bank)); setProgress(null); setError(""); setSaved(false); if (fileInput.current)
        fileInput.current.value = ""; }
    async function process(): Promise<void> { if (!file)
        return; setProgress({ message: "Preparando leitura...", percent: 4 }); setError(""); try {
        const text = await readDocument(file, (message, percent) => setProgress({ message, percent: Math.max(percent, 4) }));
        const parsed = parseStatement(text, bank);
        if (!parsed.transactions.length)
            throw new Error("Nenhuma transacao foi reconhecida. Confira o formato ou tente um arquivo mais nitido.");
        const available = categories;
        parsed.transactions = parsed.transactions.map((item) => ({ ...item, category: available.some((category) => category.type === item.type && category.name === item.category) ? item.category : available.find((category) => category.type === item.type)?.name || "" }));
        setCategories(available);
        setBank(parsed.bank);
        setCurrent(parsed);
    }
    catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : "Nao foi possivel ler este documento.");
    }
    finally {
        setProgress(null);
    } }
    function update(id: string, field: "date" | "description" | "type" | "category" | "amount", value: string): void { setCurrent((state) => ({ ...state, transactions: state.transactions.map((item) => { if (item.id !== id)
            return item; if (field === "type") {
            const type = value as TransactionType;
            const category = type === "ignored" ? item.category : categories.find((option) => option.type === type)?.name || "";
            return { ...item, type, category };
        } return { ...item, [field]: field === "amount" ? Number(value) : value } as Transaction; }) })); }
    async function confirm(): Promise<void> { if (!file || !current.transactions.length)
        return; if (current.transactions.some((item) => item.type !== "ignored" && !item.category)) {
        setError("Cadastre ao menos uma categoria para cada tipo de movimentacao antes de confirmar.");
        return;
    }
      const accepted = current.transactions.filter((item) => item.type !== "ignored");
      setProgress({ message: "Salvando no banco de dados...", percent: 70 }); setError("");
      try {
        const entry = await api.imports.create({ bank: current.bank, fileName: file.name, statementMonth: current.statementMonth, transactions: accepted });
        setHistory((items) => [entry, ...items]); setSaved(true);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar a importacao."); }
      finally { setProgress(null); }
    }
    const income = current.transactions.filter((x) => x.type === "income").reduce((s, x) => s + Number(x.amount), 0), expenses = current.transactions.filter((x) => x.type === "expense").reduce((s, x) => s + Number(x.amount), 0);
    return <>
    <PageHeading eyebrow="Importacoes" title="Transforme extratos em organizacao." aside={<span className="rounded-full bg-accent-soft px-4 py-2 text-xs font-bold text-accent">✓ Processamento privado</span>}>Leia PDFs ou imagens, revise cada lancamento e confirme apenas quando estiver tudo certo.</PageHeading>
    <aside className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-gold-soft p-4 text-xs leading-5 text-amber-900"><strong>i</strong><p><b>Proteja seus dados pessoais.</b> Confira se o documento nao exibe senhas, codigos de acesso ou dados bancarios completos.</p></aside>
    <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="grid gap-4"><section className={`${panel} p-6`}><Step>01</Step><Kicker>Nova importacao</Kicker><h2 className="font-serif text-2xl">Ler extrato bancario</h2><p className="my-4 text-xs leading-5 text-muted">O documento e analisado no navegador. Voce revisa tudo antes de salvar.</p>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Formato do extrato<select className={`${input} mt-2`} value={bank} onChange={(e) => { const selectedBank = e.target.value as Bank; setBank(selectedBank); setCurrent((x) => ({ ...x, bank: selectedBank })); }}><option value="nubank">Nubank</option><option value="banco-do-brasil">Banco do Brasil</option></select></label>
        <input ref={fileInput} type="file" accept=".pdf,image/*" hidden onChange={(e) => chooseFile(e.target.files?.[0])}/>
        {!file ? <button type="button" onClick={() => fileInput.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }} className={`mt-4 grid min-h-48 w-full place-items-center rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-accent bg-accent-soft" : "border-line bg-panel-soft"}`}><span><b className="mx-auto grid size-12 place-items-center rounded-full bg-white text-xl text-accent shadow-sm">⇧</b><strong className="mt-3 block text-xs">Selecionar PDF ou imagem</strong><small className="mt-1 block text-[10px] text-muted">ou arraste o arquivo para esta area</small></span></button> : <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-line p-3"><span className="grid size-10 place-items-center rounded-lg bg-gold-soft text-[10px] font-black text-gold">PDF</span><div className="min-w-0"><strong className="block truncate text-xs">{file.name}</strong><small className="text-[10px] text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</small></div><button onClick={clearFile} className="text-lg text-muted" aria-label="Remover arquivo">×</button></div>}
        <button onClick={process} disabled={!file || !!progress} className={`${button} mt-4 w-full px-3 text-xs`}>Ler transacoes do documento →</button>
        {progress && <div className="relative mt-3 overflow-hidden rounded-lg bg-accent-soft p-3 text-[10px] text-accent"><p>{progress.message} ({progress.percent}%)</p><span className="absolute bottom-0 left-0 h-1 bg-accent transition-all" style={{ width: `${progress.percent}%` }}/></div>}{error && <p className="mt-3 rounded-lg bg-gold-soft p-3 text-xs leading-5 text-amber-900">{error}</p>}
      </section><section className={`${panel} flex gap-3 p-4 shadow-none`}><span className="text-xl text-accent">◇</span><div><strong className="text-xs">Arquivo processado localmente</strong><p className="mt-1 text-[10px] leading-4 text-muted">O PDF fica no navegador. Ao confirmar, somente os lancamentos revisados sao salvos no banco.</p></div></section></aside>
      <section className={`${panel} min-h-[650px] min-w-0 overflow-hidden`}><div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-6"><div><Step>02</Step><h2 className="font-serif text-2xl">Revisao das transacoes</h2><p className="mt-1 text-xs text-muted">{current.transactions.length ? `${current.transactions.length} lancamentos encontrados${current.statementMonth ? ` · Fatura ${monthLabel(current.statementMonth)}` : ""}` : "Aguardando um documento"}</p></div><span className={`rounded-full px-3 py-2 text-[10px] font-bold ${saved ? "bg-accent-soft text-accent" : current.transactions.length ? "bg-gold-soft text-amber-800" : "bg-panel-soft text-muted"}`}>{saved ? "Importacao confirmada" : current.transactions.length ? "Revisao necessaria" : "Aguardando"}</span></div>
        {!current.transactions.length ? <div className="grid min-h-[540px] place-items-center p-8 text-center"><div><span className="text-4xl text-gold">⊞</span><h3 className="mt-4 font-serif text-xl">As transacoes aparecerao aqui</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">Selecione um extrato para identificar datas, descricoes e valores. Leituras com baixa confianca serao destacadas.</p></div></div> : <><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-xs"><thead className="bg-panel-soft text-left text-[10px] uppercase tracking-wider text-muted"><tr>{["Data", "Descricao", "Tipo", "Categoria", "Valor", "Confianca"].map((x) => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{current.transactions.map((item) => <tr key={item.id} className={`border-b border-line transition-colors ${transactionRowTone(item.type)}`}><Cell><input className={`${input} w-28`} value={item.date} onChange={(e) => update(item.id, "date", e.target.value)}/></Cell><Cell><input className={`${input} min-w-56`} value={item.description} onChange={(e) => update(item.id, "description", e.target.value)}/></Cell><Cell><select className={input} value={item.type} onChange={(e) => update(item.id, "type", e.target.value)}><option value="income">Entrada</option><option value="expense">Saida</option><option value="ignored">Ignorar</option></select></Cell><Cell><select className={input} value={item.category} disabled={item.type === "ignored"} onChange={(e) => update(item.id, "category", e.target.value)}>{item.type !== "ignored" && !categories.some((category) => category.type === item.type) && <option value="">Cadastre uma categoria</option>}{categories.filter((category) => item.type === "ignored" || category.type === item.type).map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></Cell><Cell><input className={`${input} w-28`} type="number" min="0" step=".01" value={item.amount} onChange={(e) => update(item.id, "amount", e.target.value)}/></Cell><Cell><span className={`rounded-full px-2 py-1 font-bold ${item.confidence > .85 ? "bg-accent-soft text-accent" : "bg-gold-soft text-amber-800"}`}>{Math.round(item.confidence * 100)}%</span></Cell></tr>)}</tbody></table></div><div className="grid gap-3 border-t border-line p-5 sm:grid-cols-3"><Total label="Entradas" value={formatCurrency(income)}/><Total label="Saidas" value={formatCurrency(expenses)}/><Total label={current.statementTotal !== null ? "Valor da fatura" : "Total liquido"} value={formatCurrency(current.statementTotal ?? income - expenses)}/></div><div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-panel-soft p-5"><p className="text-xs text-muted">Confirme apenas depois de revisar os lancamentos.</p><button onClick={confirm} disabled={saved} className={button}>{saved ? "Transacoes registradas ✓" : "Confirmar importacao →"}</button></div></>}
      </section>
    </div>
    <section className="mt-12"><div className="mb-5 flex justify-between"><div><Kicker>Arquivo</Kicker><h2 className="font-serif text-2xl">Historico de importacoes</h2></div><p className="text-xs text-muted">{history.length} {history.length === 1 ? "documento confirmado" : "documentos confirmados"}</p></div><div className={`${panel} overflow-hidden shadow-none`}>{history.length ? history.map((item) => <Link href={`/painel/importacoes/${item.id}`} key={item.id} className="grid gap-3 border-b border-line p-4 transition hover:bg-panel-soft last:border-0 sm:grid-cols-[auto_minmax(180px,1fr)_100px_130px_auto] sm:items-center"><span className="grid size-10 place-items-center rounded-lg bg-gold-soft text-[10px] font-black text-gold">PDF</span><div><strong className="block text-xs">{item.fileName}</strong><small className="text-[10px] text-muted">{item.bank === "nubank" ? "Nubank" : "Banco do Brasil"}{item.statementMonth ? ` · ${monthLabel(item.statementMonth)}` : ""}</small></div><div><strong className="block text-xs">{item.transactionCount}</strong><small className="text-[10px] text-muted">lancamentos</small></div><div><strong className="block text-xs">{formatCurrency(item.total)}</strong><small className="text-[10px] text-muted">saidas</small></div><time className="text-[10px] text-muted">{new Date(item.createdAt).toLocaleDateString("pt-BR")}</time></Link>) : <p className="p-8 text-center font-serif text-muted">Nenhum documento confirmado ainda.</p>}</div></section>
  </>;
}
function Cell({ children }: Readonly<{
    children: ReactNode;
}>) { return <td className="p-2">{children}</td>; }
function transactionRowTone(type: TransactionType): string {
    if (type === "income")
        return "bg-emerald-500/[.06] hover:bg-emerald-500/[.1]";
    if (type === "expense")
        return "bg-rose-500/[.06] hover:bg-rose-500/[.1]";
    return "bg-panel-soft opacity-50";
}
function Total({ label, value }: Readonly<{
    label: string;
    value: string;
}>) { return <div className="rounded-xl border border-line bg-panel-soft p-3"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="mt-1 block font-serif text-lg">{value}</strong></div>; }
