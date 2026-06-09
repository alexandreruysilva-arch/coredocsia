import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { Archive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/retention")({
  component: () => (
    <PageStub
      title="Retenção documental"
      description="Tabela de temporalidade, cálculo automático de prazos e eliminação."
      icon={Archive}
      reference="23"
    />
  ),
});
