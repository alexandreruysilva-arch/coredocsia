import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyRow {
  id: string;
  name: string;
  cnpj: string | null;
}

// Empresas ocultas temporariamente (ex.: durante apresentações).
const HIDDEN_COMPANY_NAMES = new Set(
  ["Tempo Soluções", "Tempo Solucoes"].map((n) => n.toLowerCase()),
);

export function useCompanies(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["companies", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CompanyRow[]> => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, cnpj")
        .eq("org_id", orgId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).filter(
        (c) => !HIDDEN_COMPANY_NAMES.has((c.name ?? "").trim().toLowerCase()),
      );
    },
  });
}
