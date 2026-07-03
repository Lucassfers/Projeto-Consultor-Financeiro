"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import Imports from "@/components/imports/Imports";
import Categories from "@/components/categories/Categories";
import type { PageName } from "@/types";

const validPages: PageName[] = ["importacoes", "categorias"];

export default function Home() {
  const [page, setPage] = useState<PageName>("importacoes");

  useEffect(() => {
    const sync = () => {
      const hash = location.hash.slice(1) as PageName;
      setPage(validPages.includes(hash) ? hash : "importacoes");
    };
    sync();
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);

  function navigate(name: PageName) {
    location.hash = name;
    setPage(name);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_50%_0%,rgba(182,132,50,.15),transparent_65%)]" />
      <Header currentPage={page} onNavigate={navigate} />
      <main className="mx-auto min-h-screen w-full max-w-[96rem] px-5 py-12 md:px-8 md:py-16 2xl:px-10">
        {page === "importacoes" && <Imports />}
        {page === "categorias" && <Categories />}
      </main>
      <Footer />
    </>
  );
}
