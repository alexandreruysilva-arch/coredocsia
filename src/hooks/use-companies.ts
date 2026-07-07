import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyRow {
  id: string;
  name: string;
  cnpj: string | null;
}

// Empresas ocultas temporariamente (ex.: durante apresentações).
function normalizeCompanyName(name: string | null | undefined) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isHiddenCompanyName(name: string | null | undefined) {
  return normalizeCompanyName(name).includes("tempo solucoes");
}

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
      return (data ?? []).filter((c) => !isHiddenCompanyName(c.name));
    },
  });
}
