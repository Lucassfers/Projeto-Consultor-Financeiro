export const panel = "rounded-2xl border border-line bg-panel shadow-[0_16px_50px_rgba(24,60,50,.06)]";
export const input = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10";
export const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-white transition hover:bg-ink disabled:hover:bg-accent";

interface ChildrenProps { children: ReactNode; }
interface PageHeadingProps extends ChildrenProps { eyebrow: string; title: string; aside?: ReactNode; }

export function Kicker({ children }: ChildrenProps) { return <p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-gold">{children}</p>; }
export function Step({ children }: ChildrenProps) { return <span className="mb-2 block font-mono text-[10px] font-bold tracking-widest text-gold">{children}</span>; }
export function PageHeading({ eyebrow, title, children, aside }: PageHeadingProps) {
  return <div className="mb-9 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
    <div className="max-w-3xl">
      <Kicker>{eyebrow}</Kicker>
      <h1 className="font-serif text-4xl leading-[1.05] md:text-6xl">{title}</h1>{children && <p className="mt-5 max-w-2xl text-sm leading-7 text-muted">{children}</p>}</div>{aside}</div>;
}
import type { ReactNode } from "react";
