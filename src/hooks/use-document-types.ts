import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DocumentTypeRow } from "@/lib/documents";

// Tipos ocultos temporariamente (ex.: durante apresentações).
const HIDDEN_TYPE_NAMES = new Set(
  ["Contra-Cheque-Filme013", "Contra-Cheque-Filme014", "Lixo"].map((n) => n.toLowerCase()),
);

export function useDocumentTypes(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["document-types", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<DocumentTypeRow[]> => {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return (data ?? []).filter((t) => !HIDDEN_TYPE_NAMES.has((t.name ?? "").toLowerCase()));
    },
  });
}

