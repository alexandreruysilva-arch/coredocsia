import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { FolderOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents")({
  component: () => (
    <PageStub
      title="GED — Documentos"
      description="Pesquisa avançada, visualização, compartilhamento seguro e versionamento."
      icon={FolderOpen}
      reference="20-22"
    />
  ),
});
