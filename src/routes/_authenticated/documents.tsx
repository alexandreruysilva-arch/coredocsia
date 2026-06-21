import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FolderOpen, Search, Eye, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { DocumentViewer } from "@/components/document-viewer";
import { useProfileBundle } from "@/hooks/use-profile";
import { useDocumentsList } from "@/hooks/use-documents";
import { useDocumentTypes } from "@/hooks/use-document-types";
import { useAllowedDocumentTypeIds } from "@/hooks/use-allowed-document-types";
import { useCompanies } from "@/hooks/use-companies";
import { useDocumentTypeFields } from "@/hooks/use-document-type-fields";
import { Label } from "@/components/ui/label";

import { formatBytes, type DocumentRow } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const navigate = useNavigate();
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const { data: allTypes = [] } = useDocumentTypes(orgId);
  const { data: companies = [] } = useCompanies(orgId);
  const { data: allowedTypeIds = null } = useAllowedDocumentTypeIds();

  // Restrict the type filter dropdown to allowed types as well.
  const types =
    allowedTypeIds === null
      ? allTypes
      : allTypes.filter((t) => allowedTypeIds.includes(t.id));

  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState<string>("all");
  const [companyId, setCompanyId] = useState<string>("all");
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<DocumentRow | null>(null);

  const { data: typeFields = [] } = useDocumentTypeFields(
    typeId !== "all" ? typeId : null,
  );

  const { data: docs = [], isLoading } = useDocumentsList({
    orgId,
    status: "all",
    typeId,
    search: search.length >= 2 ? search : "",
    allowedTypeIds,
  });

  const activeFieldFilters = Object.entries(fieldFilters).filter(
    ([, v]) => v.trim() !== "",
  );

  const filteredDocs = docs.filter((d: any) => {
    if (companyId !== "all" && d.company_id !== companyId) return false;
    if (activeFieldFilters.length > 0) {
      const fv = (d.field_values ?? {}) as Record<string, unknown>;
      for (const [key, val] of activeFieldFilters) {
        const docVal = String(fv[key] ?? "").toLowerCase();
        if (!docVal.includes(val.trim().toLowerCase())) return false;
      }
    }
    return true;
  });

  const typeName = (id: string | null) =>
    id ? allTypes.find((t) => t.id === id)?.name ?? "—" : "—";
  const companyName = (id: string | null | undefined) =>
    id ? companies.find((c) => c.id === id)?.name ?? "—" : "—";



  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <header>
            <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-2">
              <FolderOpen className="h-7 w-7 text-primary" /> Documentos
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestão eletrônica de documentos processados.
            </p>
          </header>

          <Card className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome..."
                className="pl-9"
              />
            </div>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={typeId}
              onValueChange={(v) => {
                setTypeId(v);
                setFieldFilters({});
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          {typeId !== "all" && typeFields.length > 0 && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Filtrar pelos campos do tipo</h3>
                {Object.values(fieldFilters).some((v) => v.trim() !== "") && (
                  <Button size="sm" variant="ghost" onClick={() => setFieldFilters({})}>
                    Limpar
                  </Button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {typeFields.map((f) => {
                  const val = fieldFilters[f.field_key] ?? "";
                  const set = (v: string) =>
                    setFieldFilters((prev) => ({ ...prev, [f.field_key]: v }));
                  return (
                    <div key={f.id} className="space-y-1.5">
                      <Label htmlFor={`ff-${f.id}`} className="text-xs">
                        {f.label}
                      </Label>
                      {f.field_type === "select" && Array.isArray(f.options) ? (
                        <Select
                          value={val || "all"}
                          onValueChange={(v) => set(v === "all" ? "" : v)}
                        >
                          <SelectTrigger id={`ff-${f.id}`}>
                            <SelectValue placeholder="Todos" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            {(f.options as string[]).map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`ff-${f.id}`}
                          value={val}
                          onChange={(e) => set(e.target.value)}
                          type={
                            f.field_type === "number"
                              ? "number"
                              : f.field_type === "date"
                              ? "date"
                              : "text"
                          }
                          placeholder={`Filtrar ${f.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredDocs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum documento encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {filteredDocs.map((doc: any) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer transition-colors"
                    data-state={preview?.id === doc.id ? "selected" : undefined}
                    onClick={() => setPreview(doc)}
                  >
                    <TableCell className="font-medium max-w-[260px] truncate">{doc.name}</TableCell>
                    <TableCell className="text-sm">{companyName(doc.company_id)}</TableCell>
                    <TableCell className="text-sm">{typeName(doc.document_type_id)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {doc.tags.slice(0, 3).map((t: string) => (
                          <Badge key={t} variant="secondary" className="text-xs font-normal">
                            {t}
                          </Badge>
                        ))}
                        {doc.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs font-normal">
                            +{doc.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatBytes(Number(doc.size_bytes))}</TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(doc.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate({ to: "/documents/$id", params: { id: doc.id } });
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" /> Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>


      {preview && (
        <aside className="w-[480px] border-l border-border flex flex-col bg-background shrink-0">
          <div className="flex items-center justify-between p-3 border-b border-border bg-card">
            <h2 className="font-medium text-sm">Pré-visualização</h2>
            <Button size="icon" variant="ghost" onClick={() => setPreview(null)} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <DocumentViewer doc={preview} />
          </div>
        </aside>
      )}
    </div>
  );
}
