import { createFileRoute } from "@tanstack/react-router";
import { PageStub } from "@/components/page-stub";
import { CheckSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/workflow")({
  component: () => (
    <PageStub
      title="Workflow de qualidade"
      description="Aprovação, reprovação, correção e revalidação documental."
      icon={CheckSquare}
      reference="18"
    />
  ),
});
