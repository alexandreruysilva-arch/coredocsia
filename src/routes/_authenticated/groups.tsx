import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { Tags } from "lucide-react";

export const Route = createFileRoute("/_authenticated/groups")({
  component: () => (
    <PageStub
      title="Grupos & Metadados"
      description="Cadastro de grupos de documentos e metadados exigidos por grupo."
      icon={Tags}
      reference="7"
    />
  ),
});
