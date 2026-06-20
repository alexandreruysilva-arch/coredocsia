import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cadastro/usuario")({
  component: () => (
    <PageStub
      title="Usuário"
      description="Cadastro de usuários da organização."
      icon={Users}
    />
  ),
});
