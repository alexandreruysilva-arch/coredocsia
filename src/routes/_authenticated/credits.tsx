import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/credits")({
  component: () => (
    <PageStub
      title="Créditos"
      description="Saldo, consumo, recargas via Stripe e notificações de saldo baixo."
      icon={Wallet}
      reference="4"
    />
  ),
});
