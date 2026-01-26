import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Building2, MoreHorizontal, Pencil, Plus, Ship, Trash2 } from "lucide-react";
import { useEmpresas, useCreateEmpresa, useUpdateEmpresa, useDeleteEmpresa, Empresa } from "@/hooks/useEmpresas";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";
import { EmpresaForm } from "@/components/forms/EmpresaForm";
import { MetricCard } from "@/components/MetricCard";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export default function Empresas() {
  const { data: empresas, isLoading: loadingEmpresas } = useEmpresas();
  const { data: embarcacoes } = useEmbarcacoes();
  const createEmpresa = useCreateEmpresa();
  const updateEmpresa = useUpdateEmpresa();
  const deleteEmpresa = useDeleteEmpresa();

  const [formOpen, setFormOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [empresaToDelete, setEmpresaToDelete] = useState<Empresa | null>(null);

  const handleCreate = () => {
    setEditingEmpresa(null);
    setFormOpen(true);
  };

  const handleEdit = (empresa: Empresa) => {
    setEditingEmpresa(empresa);
    setFormOpen(true);
  };

  const handleDelete = (empresa: Empresa) => {
    setEmpresaToDelete(empresa);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (empresaToDelete) {
      deleteEmpresa.mutate(empresaToDelete.id);
    }
    setDeleteDialogOpen(false);
    setEmpresaToDelete(null);
  };

  const handleSubmit = (data: any) => {
    if (editingEmpresa) {
      updateEmpresa.mutate(data, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createEmpresa.mutate(data, {
        onSuccess: () => setFormOpen(false),
      });
    }
  };

  // Calculate statistics
  const totalEmpresas = empresas?.length || 0;
  const empresasAtivas = empresas?.filter((e) => e.status === "ativo").length || 0;
  const empresasInativas = empresas?.filter((e) => e.status === "inativo").length || 0;
  const totalEmbarcacoes = embarcacoes?.length || 0;

  // Count embarcações per empresa
  const getEmbarcacoesCount = (empresaId: string) => {
    return embarcacoes?.filter((e) => e.empresa_id === empresaId).length || 0;
  };

  // Check if empresa has embarcações (prevent deletion)
  const hasEmbarcacoes = (empresaId: string) => {
    return getEmbarcacoesCount(empresaId) > 0;
  };

  if (loadingEmpresas) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">Gerencie as empresas cadastradas no sistema</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Total de Empresas"
          value={totalEmpresas}
          icon={Building2}
        />
        <MetricCard
          title="Ativas"
          value={empresasAtivas}
          icon={Building2}
          change={totalEmpresas > 0 ? `${Math.round((empresasAtivas / totalEmpresas) * 100)}% do total` : undefined}
          changeType="positive"
        />
        <MetricCard
          title="Inativas"
          value={empresasInativas}
          icon={Building2}
        />
        <MetricCard
          title="Embarcações"
          value={totalEmbarcacoes}
          icon={Ship}
        />
      </div>

      {/* Empresas Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Empresas</CardTitle>
          <CardDescription>
            Empresas cadastradas no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {empresas && empresas.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Embarcações</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[70px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresas.map((empresa) => (
                  <TableRow key={empresa.id}>
                    <TableCell className="font-medium">{empresa.nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {empresa.cnpj || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {empresa.email || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {empresa.telefone || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getEmbarcacoesCount(empresa.id)} embarcações
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={empresa.status === "ativo" ? "default" : "secondary"}>
                        {empresa.status === "ativo" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(empresa)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(empresa)}
                            className="text-destructive"
                            disabled={hasEmbarcacoes(empresa.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {hasEmbarcacoes(empresa.id) ? "Possui embarcações" : "Excluir"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Building2}
              title="Nenhuma empresa cadastrada"
              description="Cadastre a primeira empresa para começar a gerenciar embarcações e tripulantes."
              actionLabel="Nova Empresa"
              onAction={handleCreate}
            />
          )}
        </CardContent>
      </Card>

      {/* Form Modal */}
      <EmpresaForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        initialData={editingEmpresa || undefined}
        isLoading={createEmpresa.isPending || updateEmpresa.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a empresa "{empresaToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
