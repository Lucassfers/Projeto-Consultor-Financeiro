"use client";

import { useEffect, useState, type FormEvent } from "react";
import { button, input, Kicker, PageHeading, panel } from "@/components/ui";
import { api } from "@/lib/api";
import type { Category, CategoryType } from "@/types";

const initialForm = { name: "", type: "expense" as CategoryType, color: "#164c3d" };

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.categories.list().then(setCategories).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return setError("Informe o nome da categoria.");
    if (categories.some((item) => item.id !== editingId && item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return setError("Ja existe uma categoria com esse nome.");
    setBusy(true); setError("");
    try {
      if (editingId) {
        const saved = await api.categories.update(editingId, { ...form, name });
        setCategories((items) => items.map((item) => item.id === editingId ? saved : item));
      } else {
        const saved = await api.categories.create({ ...form, name });
        setCategories((items) => [...items, saved]);
      }
      setForm(initialForm); setEditingId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar a categoria."); }
    finally { setBusy(false); }
  }

  function edit(category: Category) { setEditingId(category.id); setForm({ name: category.name, type: category.type, color: category.color }); setError(""); scrollTo({ top: 0, behavior: "smooth" }); }
  function cancel() { setEditingId(null); setForm(initialForm); setError(""); }
  async function remove(category: Category) {
    if (!confirm(`Excluir a categoria “${category.name}”? Lancamentos ja salvos manterao esse nome.`)) return;
    setBusy(true); setError("");
    try {
      await api.categories.remove(category.id);
      setCategories((items) => items.filter((item) => item.id !== category.id));
      if (editingId === category.id) cancel();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Nao foi possivel excluir a categoria."); }
    finally { setBusy(false); }
  }

  const expenses = categories.filter((item) => item.type === "expense");
  const incomes = categories.filter((item) => item.type === "income");

  return <>
    <PageHeading eyebrow="Categorias" title="Organize do seu jeito.">Cadastre as opcoes usadas para classificar cada entrada e saida durante a revisao das importacoes.</PageHeading>
    <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form onSubmit={submit} className={`${panel} grid gap-4 p-6`}>
        <div><Kicker>{editingId ? "Editar categoria" : "Nova categoria"}</Kicker><h2 className="font-serif text-2xl">{editingId ? "Atualize os dados" : "Cadastrar opcao"}</h2></div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Nome<input className={`${input} mt-2`} value={form.name} maxLength={40} placeholder="Ex.: Educacao" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Movimentacao<select className={`${input} mt-2`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CategoryType })}><option value="expense">Saida monetaria</option><option value="income">Entrada monetaria</option></select></label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Cor<span className="mt-2 flex items-center gap-3"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-11 w-16 cursor-pointer rounded-lg border border-line bg-white p-1" /><span className="text-xs normal-case tracking-normal text-muted">Usada nos graficos do painel</span></span></label>
        {error && <p className="rounded-lg bg-gold-soft p-3 text-xs text-amber-900">{error}</p>}
        <div className="flex gap-2"><button disabled={busy} className={`${button} flex-1`}>{busy ? "Salvando..." : editingId ? "Salvar alteracoes" : "Cadastrar categoria"}</button>{editingId && <button type="button" onClick={cancel} className="min-h-11 rounded-xl border border-line px-4 text-xs font-bold">Cancelar</button>}</div>
      </form>
      <section className="grid gap-5">
        {loading && <p className={`${panel} p-8 text-center text-sm text-muted`}>Carregando categorias do banco...</p>}
        {!loading && <CategoryList title="Saidas monetarias" description="Categorias exibidas em compras, contas e demais gastos." categories={expenses} onEdit={edit} onRemove={remove} />}
        {!loading && <CategoryList title="Entradas monetarias" description="Categorias exibidas em recebimentos, creditos e rendas." categories={incomes} onEdit={edit} onRemove={remove} />}
      </section>
    </div>
  </>;
}

function CategoryList({ title, description, categories, onEdit, onRemove }: Readonly<{ title: string; description: string; categories: Category[]; onEdit: (category: Category) => void; onRemove: (category: Category) => void }>) {
  return <section className={`${panel} overflow-hidden`}><header className="flex items-end justify-between gap-4 border-b border-line p-5"><div><h2 className="font-serif text-xl">{title}</h2><p className="mt-1 text-xs text-muted">{description}</p></div><strong className="rounded-full bg-panel-soft px-3 py-2 text-xs">{categories.length}</strong></header>{categories.length ? <div>{categories.map((category) => <article key={category.id} className="flex items-center gap-4 border-b border-line p-4 last:border-0"><span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><strong className="min-w-0 flex-1 truncate text-sm">{category.name}</strong><button onClick={() => onEdit(category)} className="rounded-lg px-3 py-2 text-xs font-bold text-accent hover:bg-accent-soft">Editar</button><button onClick={() => onRemove(category)} className="rounded-lg px-3 py-2 text-xs font-bold text-amber-800 hover:bg-gold-soft">Excluir</button></article>)}</div> : <p className="p-8 text-center text-sm text-muted">Nenhuma categoria cadastrada para este tipo.</p>}</section>;
}
