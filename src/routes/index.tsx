import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FileScan, ShieldCheck, Workflow, Database, Sparkles, Archive } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AP - CoreDocs IA — Plataforma Documental Inteligente" },
      {
        name: "description",
        content:
          "Digitalize, processe e gerencie documentos com OCR, IA e GED em uma plataforma SaaS multi-tenant.",
      },
      { property: "og:title", content: "AP - CoreDocs IA — Plataforma Documental Inteligente" },
      {
        property: "og:description",
        content:
          "Digitalize, processe e gerencie documentos com OCR, IA e GED em uma plataforma SaaS multi-tenant.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: FileScan, title: "Processamento Documental", desc: "Upload, conversão e OCR de alta precisão em lote." },
  { icon: Sparkles, title: "Extração com IA", desc: "Templates inteligentes via N8N para indexar automaticamente." },
  { icon: Database, title: "GED Multi-Tenant", desc: "Pesquisa avançada, compartilhamento seguro e versionamento." },
  { icon: Workflow, title: "Workflow de Qualidade", desc: "Aprovação, reprovação e revalidação com trilha completa." },
  { icon: Archive, title: "Retenção e Temporalidade", desc: "Classificação por tabela, cálculo automático de prazos." },
  { icon: ShieldCheck, title: "Auditoria & LGPD", desc: "Logs granulares, hash SHA-256 e isolamento por tenant." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary grid place-items-center">
              <FileScan className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">AP - CoreDocs IA</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Criar conta</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Plataforma inteligente de documentos
          </div>
          <h1 className="mt-6 font-display text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
            Sua operação documental,{" "}
            <span className="text-primary">organizada</span> e{" "}
            <span className="text-primary">auditável</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Plataforma SaaS multi-tenant para processamento documental inteligente, OCR,
            extração com IA, GED, workflow de qualidade e gestão de retenção — com
            cobrança por créditos e isolamento total entre clientes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Começar agora</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#recursos">Ver recursos</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="recursos" className="mx-auto max-w-6xl px-6 py-16 border-t border-border/60">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div className="h-10 w-10 rounded-lg bg-accent grid place-items-center">
                <f.icon className="h-5 w-5 text-accent-foreground" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 mt-8">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground text-center">
          <span>© {new Date().getFullYear()} AP - CoreDocs IA. Todos os direitos reservados.</span>
        </div>
      </footer>
    </div>
  );
}
