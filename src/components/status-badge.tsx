import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type DocStatus } from "@/lib/documents";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

const STYLE: Record<DocStatus, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  processing: "bg-primary/15 text-primary border-primary/30",
  processed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

const ICON = {
  pending: Clock,
  processing: Loader2,
  processed: CheckCircle2,
  failed: XCircle,
} as const;

export function StatusBadge({ status }: { status: DocStatus }) {
  const Icon = ICON[status];
  return (
    <Badge variant="outline" className={`gap-1.5 font-normal ${STYLE[status]}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
