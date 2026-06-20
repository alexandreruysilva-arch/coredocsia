import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastro/empresa")({
  component: () => (
    <PageStub
      title="Empresa"
      description="Cadastro de empresas da organização."
      icon={Building2}
    />
  ),
});
