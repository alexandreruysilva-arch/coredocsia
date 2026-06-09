import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/templates")({
  component: () => (
    <PageStub
      title="Templates de extração"
      description="Modelos de extração inteligente via IA (integração N8N)."
      icon={FileText}
      reference="12"
    />
  ),
});
