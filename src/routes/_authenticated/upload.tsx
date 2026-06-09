import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload")({
  component: () => (
    <PageStub
      title="Upload de documentos"
      description="Envio individual, em lote, monitoramento de pastas e captura via scanner."
      icon={Upload}
      reference="8"
    />
  ),
});
