import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useProfileBundle } from "@/hooks/use-profile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings,
  User,
  Building,
  Users,
  Shield,
  Bell,
  HardDrive,
  Loader2,
  Trash2,
  Plus,
  Sparkles,

} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profileBundle, loading: profileLoading } = useProfileBundle();
  const [activeTab, setActiveTab] = useState("profile");

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isAdmin = profileBundle?.roles.includes("org_admin") || profileBundle?.isPlatformAdmin;

  return (
    <div className="container max-w-6xl py-8 px-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie sua conta, organização e preferências do sistema.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" /> Perfil
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2">
            <Building className="h-4 w-4" /> Organização
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" /> Membros
            </TabsTrigger>
          )}
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" /> Notificações
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="billing" className="gap-2">
              <Sparkles className="h-4 w-4" /> Faturamento IA
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileSettings profile={profileBundle?.profile} />
        </TabsContent>

        <TabsContent value="organization" className="space-y-6">
          <OrganizationSettings 
            organization={profileBundle?.currentOrg} 
            isAdmin={!!isAdmin} 
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="members" className="space-y-6">
            <MembersSettings organizationId={profileBundle?.currentOrg?.id} />
          </TabsContent>
        )}

        <TabsContent value="notifications" className="space-y-6">
          <NotificationSettings />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="billing" className="space-y-6">
            <BillingSettings organizationId={profileBundle?.currentOrg?.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function BillingSettings({ organizationId }: { organizationId: string | undefined }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-billing", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("ai_cost_per_file")
        .eq("id", organizationId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [price, setPrice] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // sync default
  useEffect(() => {
    if (data?.ai_cost_per_file != null) setPrice(String(data.ai_cost_per_file));
  }, [data?.ai_cost_per_file]);


  async function handleSave() {
    const parsed = Number(String(price).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Informe um valor válido (R$).");
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ ai_cost_per_file: parsed })
        .eq("id", organizationId as string);
      if (error) throw error;
      toast.success("Preço por arquivo atualizado!");
      queryClient.invalidateQueries({ queryKey: ["org-billing", organizationId] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custo da indexação por IA</CardTitle>
        <CardDescription>
          Valor cobrado por cada arquivo processado pela IA. Aplica-se a novos
          processamentos — logs antigos preservam o custo registrado na época.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="ai-cost">Preço por arquivo (R$)</Label>
              <Input
                id="ai-cost"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.15"
              />
              <p className="text-xs text-muted-foreground">
                Use ponto ou vírgula como separador decimal. Ex.: 0.15 = R$ 0,15.
              </p>
            </div>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar preço
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}


function ProfileSettings({ profile }: { profile: any }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.full_name || "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("id", profile.id);

      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["profile-bundle"] });
    } catch (error: any) {
      toast.error("Erro ao atualizar perfil: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu Perfil</CardTitle>
        <CardDescription>
          Como as outras pessoas verão você no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome completo</Label>
          <Input 
            id="name" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Seu nome"
          />
        </div>
        <div className="pt-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizationSettings({ organization, isAdmin }: { organization: any; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(organization?.name || "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!isAdmin) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name })
        .eq("id", organization.id);

      if (error) throw error;
      toast.success("Organização atualizada!");
      queryClient.invalidateQueries({ queryKey: ["profile-bundle"] });
    } catch (error: any) {
      toast.error("Erro ao atualizar organização: " + error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações Básicas</CardTitle>
          <CardDescription>
            Detalhes da sua empresa ou workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome da Organização</Label>
            <Input 
              id="org-name" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Identificador (Slug)</Label>
            <Input id="org-slug" value={organization?.slug || ""} disabled />
            <p className="text-[10px] text-muted-foreground">
              O slug é usado na URL e não pode ser alterado.
            </p>
          </div>
          {isAdmin && (
            <div className="pt-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar organização
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <CardTitle>Armazenamento</CardTitle>
          </div>
          <CardDescription>
            Configurações de infraestrutura de arquivos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <div className="font-medium flex items-center gap-2">
                Google Drive
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none">Conectado</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Todos os arquivos são armazenados no Drive da CARS.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MembersSettings({ organizationId }: { organizationId: string | undefined }) {
  const queryClient = useQueryClient();
  
  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select(`
          id,
          role,
          user_id,
          profiles:user_id (
            full_name,
            id
          )
        `)
        .eq("org_id", organizationId as string);
      
      if (error) throw error;
      return data;
    }
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: any }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo atualizado");
      queryClient.invalidateQueries({ queryKey: ["org-members", organizationId] });
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar cargo: " + error.message);
    }
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Equipe</CardTitle>
          <CardDescription>
            Gerencie quem tem acesso a esta organização.
          </CardDescription>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Convidar
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member: any) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">
                  {member.profiles?.full_name || "Sem nome"}
                </TableCell>
                <TableCell>
                  <Select 
                    defaultValue={member.role} 
                    onValueChange={(val) => updateRoleMutation.mutate({ memberId: member.id, role: val })}
                  >
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Administrador</SelectItem>
                      <SelectItem value="operator">Operador</SelectItem>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function NotificationSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências de Notificação</CardTitle>
        <CardDescription>
          Escolha como e quando você quer ser notificado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="space-y-0.5">
            <Label>Emails de processamento</Label>
            <p className="text-sm text-muted-foreground">Receba um alerta quando um lote de documentos for finalizado.</p>
          </div>
          <div className="flex items-center h-6">
             <Badge variant="outline">Em breve</Badge>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="space-y-0.5">
            <Label>Alertas de erro</Label>
            <p className="text-sm text-muted-foreground">Seja notificado imediatamente se um upload falhar.</p>
          </div>
          <div className="flex items-center h-6">
             <Badge variant="outline">Em breve</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
