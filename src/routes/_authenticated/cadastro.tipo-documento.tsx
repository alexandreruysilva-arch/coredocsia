import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { FileType } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastro/tipo-documento")({
  component: () => (
    <PageStub
      title="Tipo Documento"
      description="Cadastro de tipos de documento."
      icon={FileType}
    />
  ),
});
