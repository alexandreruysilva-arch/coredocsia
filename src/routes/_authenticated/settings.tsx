import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: () => (
    <PageStub
      title="Configurações"
      description="Perfil, organização, membros, papéis e preferências."
      icon={Settings}
      reference="5-6"
    />
  ),
});
