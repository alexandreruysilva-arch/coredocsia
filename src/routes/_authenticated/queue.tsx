import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/queue")({
  component: () => (
    <PageStub
      title="Fila de processamento"
      description="Status em tempo real de conversão, OCR, extração de IA e indexação."
      icon={ListChecks}
      reference="8.2"
    />
  ),
});
