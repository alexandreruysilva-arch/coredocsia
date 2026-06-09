import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: () => (
    <PageStub
      title="Auditoria"
      description="Trilha completa: acesso, processamento, GED, LGPD e operação."
      icon={ScrollText}
      reference="19"
    />
  ),
});
