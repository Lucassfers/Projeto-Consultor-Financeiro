import type { PageName } from "@/types";

const pages: Record<PageName, { label: string; icon: string }> = {
  importacoes: { label: "Importacoes", icon: "I" },
  categorias: { label: "Categorias", icon: "C" },
};

interface HeaderProps {
  currentPage: PageName;
  onNavigate: (page: PageName) => void;
}

export function Header({ currentPage, onNavigate }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 mx-auto flex w-full max-w-[96rem] flex-col items-start gap-3 bg-canvas/90 px-5 py-4 backdrop-blur sm:relative sm:flex-row sm:items-center sm:justify-center md:px-8 2xl:px-10">
      <a href="/" className="flex items-center gap-3 text-left sm:absolute sm:left-5 md:left-8 2xl:left-10" aria-label="Finora, inicio">
        <span className="grid size-11 place-items-center rounded-[14px_14px_14px_4px] bg-accent font-serif text-2xl text-white">F</span>
        <span className="hidden sm:block"><strong className="block font-serif text-lg">Finora</strong><small className="text-[10px] uppercase tracking-[.14em] text-muted">Consultoria inteligente</small></span>
      </a>
      <nav className="flex w-full justify-center overflow-x-auto rounded-xl bg-canvas p-1 sm:w-auto" aria-label="Navegacao principal">
        <a href="/" className="flex min-h-9 items-center rounded-lg px-3 text-xs font-bold text-muted transition hover:bg-accent-soft hover:text-ink sm:px-4">Consultoria</a>
        {(Object.entries(pages) as [PageName, (typeof pages)[PageName]][]).map(([name, item]) => (
          <button key={name} onClick={() => onNavigate(name)} className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold transition sm:px-4 ${currentPage === name ? "bg-canvas text-accent" : "text-muted hover:bg-accent-soft hover:text-ink"}`}>
            <span className="hidden sm:inline" aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
