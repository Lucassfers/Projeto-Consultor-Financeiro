"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Kicker, PageHeading, button, input, panel } from "@/components/ui";
import { api } from "@/lib/api";
import { formatCurrency, monthLabel } from "@/lib/store";
import type { Category, ImportDetails as ImportDetailsType, Transaction } from "@/types";

interface ImportDetailsProps {
  id: string;
}

export default function ImportDetails({ id }: ImportDetailsProps) {
  const [details, setDetails] = useState<ImportDetailsType | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.imports.get(id), api.categories.list()])
      .then(([importDetails, savedCategories]) => {
        if (!active) return;
        setDetails(importDetails);
        setTransactions(importDetails.transactions);
        setCategories(savedCategories);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Nao foi possivel carregar a importacao."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const totals = useMemo(() => {
    const income = transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
    return { income, expense };
  }, [transactions]);

  function updateCategory(transactionId: string, category: string) {
    setMessage("");
    setTransactions((items) => items.map((item) => item.id === transactionId ? { ...item, category } : item));
  }

  async function save() {
    if (!details) return;
    if (transactions.some((item) => item.type !== "ignored" && !item.category)) {
      setError("Todas as transacoes precisam de uma categoria antes de salvar.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.imports.updateTransactions(details.id, transactions.map(({ id, category }) => ({ id, category })));
      setTransactions(updated);
      setMessage("Categorias salvas no banco de dados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar as alteracoes.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeading eyebrow="Importacao" title={details?.fileName || "Carregando importacao"} aside={<Link href="/painel#importacoes" className="rounded-xl border border-line px-4 py-3 text-xs font-bold text-accent">Voltar ao historico</Link>}>
      Revise as categorias salvas para este documento. As alteracoes passam a valer nos graficos e totais do dashboard.
    </PageHeading>

    {loading && <p className={`${panel} p-8 text-center text-sm text-muted`}>Carregando dados da importacao...</p>}
    {error && <p className="mb-5 rounded-xl bg-gold-soft p-4 text-xs leading-5 text-amber-900">{error}</p>}
    {message && <p className="mb-5 rounded-xl bg-accent-soft p-4 text-xs font-bold text-accent">{message}</p>}

    {details && !loading && <>
      <section className={`${panel} mb-5 grid overflow-hidden sm:grid-cols-4`}>
        <Summary label="Banco" value={details.bank === "nubank" ? "Nubank" : "Banco do Brasil"} />
        <Summary label="Periodo" value={details.statementMonth ? monthLabel(details.statementMonth) : "Nao informado"} />
        <Summary label="Entradas" value={formatCurrency(totals.income)} />
        <Summary label="Saidas" value={formatCurrency(totals.expense)} />
      </section>

      <section className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line p-5">
          <div>
            <Kicker>Transacoes</Kicker>
            <h2 className="font-serif text-2xl">Categorias da importacao</h2>
          </div>
          <p className="text-xs text-muted">{transactions.length} lancamentos salvos</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="bg-panel-soft text-left text-[10px] uppercase tracking-wider text-muted">
              <tr>{["Data", "Descricao", "Tipo", "Categoria", "Valor"].map((item) => <th key={item} className="p-3">{item}</th>)}</tr>
            </thead>
            <tbody>
              {transactions.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="p-3">{item.date}</td>
                  <td className="p-3"><strong className="block max-w-xl truncate">{item.description}</strong></td>
                  <td className="p-3">{item.type === "income" ? "Entrada" : "Saida"}</td>
                  <td className="p-3">
                    <select className={input} value={item.category} onChange={(event) => updateCategory(item.id, event.target.value)}>
                      {!item.category && <option value="">Selecione</option>}
                      {categories.filter((category) => category.type === item.type).map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                    </select>
                  </td>
                  <td className="p-3 font-bold">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-panel-soft p-5">
          <p className="text-xs text-muted">Salve para atualizar o historico e os calculos do dashboard.</p>
          <button className={button} disabled={saving || !transactions.length} onClick={save}>{saving ? "Salvando..." : "Salvar categorias"}</button>
        </div>
      </section>
    </>}
  </>;
}

function Summary({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div className="flex min-h-20 items-center justify-between border-b border-line px-5 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span><strong className="text-right font-serif text-lg">{value}</strong></div>;
}
