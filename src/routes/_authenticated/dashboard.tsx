import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-stub";
import { useProfileBundle } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, ListChecks, FolderOpen, Wallet, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data, loading } = useProfileBundle();

  const stats = [
    { label: "Documentos processados", value: "—", hint: "Últimos 30 dias" },
    { label: "Na fila", value: "—", hint: "Aguardando OCR" },
    { label: "Créditos disponíveis", value: "—", hint: "Saldo atual" },
    { label: "Workflow pendente", value: "—", hint: "Aguardando revisão" },
  ];

  const shortcuts = [
    { to: "/upload", label: "Enviar documentos", icon: Upload },
    { to: "/queue", label: "Ver fila", icon: ListChecks },
    { to: "/documents", label: "Pesquisar GED", icon: FolderOpen },
    { to: "/credits", label: "Comprar créditos", icon: Wallet },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title={`Olá, ${loading ? "..." : data?.profile.full_name?.split(" ")[0] ?? "usuário"}`}
        description={
          data?.currentOrg
            ? `Organização ativa: ${data.currentOrg.name}`
            : "Configure sua organização para começar."
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-display text-3xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {shortcuts.map((s) => (
          <Button
            key={s.to}
            asChild
            variant="outline"
            className="h-auto py-5 justify-between"
          >
            <Link to={s.to}>
              <span className="flex items-center gap-3">
                <s.icon className="h-4 w-4 text-primary" />
                {s.label}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Button>
        ))}
      </div>

      <Card className="mt-8 border-border/60 bg-accent/30">
        <CardContent className="pt-6">
          <h3 className="font-display font-semibold">Próximos passos</h3>
          <p className="text-sm text-muted-foreground mt-1">
            A fundação multi-tenant está ativa. Os módulos de upload, OCR, GED, créditos,
            workflow e retenção serão implementados nas próximas fases conforme o roadmap
            do PRD.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
