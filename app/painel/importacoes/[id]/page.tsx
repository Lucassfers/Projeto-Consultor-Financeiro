"use client";

import { useParams } from "next/navigation";
import ImportDetails from "@/components/imports/ImportDetails";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import type { PageName } from "@/types";

export default function ImportPage() {
  const params = useParams<{ id: string }>();

  function navigate(page: PageName) {
    location.href = `/painel#${page}`;
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_50%_0%,rgba(182,132,50,.15),transparent_65%)]" />
      <Header currentPage="importacoes" onNavigate={navigate} />
      <main className="mx-auto min-h-screen w-full max-w-[96rem] px-5 py-12 md:px-8 md:py-16 2xl:px-10">
        <ImportDetails id={params.id} />
      </main>
      <Footer />
    </>
  );
}
