import { useState } from "react";
import { Plus, Trash2, UserCog, Shield, Building2, Ship, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useUsuarios, useCreateUser, useDeleteUser, useUpdateUser, SystemUser } from "@/hooks/useUsuarios";
import { useEmpresas } from "@/hooks/useEmpresas";
import { useEmbarcacoes } from "@/hooks/useEmbarcacoes";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email("Email inválido").max(255, "Email muito longo"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(100, "Senha muito longa"),
  role: z.enum(['super_admin', 'empresa_admin', 'gerente_embarcacao']),
  empresa_id: z.string().optional(),
  embarcacao_id: z.string().optional(),
});

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  empresa_admin: 'Admin Empresa',
  gerente_embarcacao: 'Gerente Embarcação',
};

const roleBadgeVariants: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  super_admin: 'default',
  empresa_admin: 'secondary',
  gerente_embarcacao: 'outline',
};

export default function Usuarios() {
  const { user, hasRole } = useAuth();
  const { data: usuarios = [], isLoading } = useUsuarios();
  const { data: empresas = [] } = useEmpresas();
  const { data: embarcacoes = [] } = useEmbarcacoes();
  const createUserMutation = useCreateUser();
  const deleteUserMutation = useDeleteUser();
  const updateUserMutation = useUpdateUser();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: '' as UserRole | '',
    empresa_id: '',
    embarcacao_id: '',
  });
  const [editFormData, setEditFormData] = useState({
    role: '' as UserRole | '',
    empresa_id: '',
    embarcacao_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const isSuperAdmin = hasRole(['super_admin']);
  const isEmpresaAdmin = hasRole(['empresa_admin']);

  // Filter available roles based on requester's role
  const availableRoles: UserRole[] = isSuperAdmin 
    ? ['super_admin', 'empresa_admin', 'gerente_embarcacao']
    : isEmpresaAdmin 
      ? ['gerente_embarcacao']
      : [];

  // Filter embarcacoes based on selected empresa
  const filteredEmbarcacoes = formData.empresa_id 
    ? embarcacoes.filter(e => e.empresa_id === formData.empresa_id)
    : embarcacoes;

  const editFilteredEmbarcacoes = editFormData.empresa_id 
    ? embarcacoes.filter(e => e.empresa_id === editFormData.empresa_id)
    : embarcacoes;

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Reset dependent fields when empresa changes
      if (field === 'empresa_id') {
        newData.embarcacao_id = '';
      }
      
      // Reset empresa/embarcacao when role changes to super_admin
      if (field === 'role' && value === 'super_admin') {
        newData.empresa_id = '';
        newData.embarcacao_id = '';
      }
      
      // Reset embarcacao when role changes to empresa_admin
      if (field === 'role' && value === 'empresa_admin') {
        newData.embarcacao_id = '';
      }
      
      return newData;
    });
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleEditInputChange = (field: string, value: string) => {
    setEditFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      if (field === 'empresa_id') {
        newData.embarcacao_id = '';
      }
      
      if (field === 'role' && value === 'super_admin') {
        newData.empresa_id = '';
        newData.embarcacao_id = '';
      }
      
      if (field === 'role' && value === 'empresa_admin') {
        newData.embarcacao_id = '';
      }
      
      return newData;
    });
    setEditErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    const result = createUserSchema.safeParse(formData);
    if (!result.success) {
      result.error.errors.forEach(err => {
        if (err.path[0]) {
          newErrors[err.path[0] as string] = err.message;
        }
      });
    }

    // Validate role-specific requirements
    if (formData.role === 'empresa_admin' && !formData.empresa_id) {
      newErrors.empresa_id = 'Selecione uma empresa';
    }
    
    if (formData.role === 'gerente_embarcacao') {
      if (!formData.empresa_id) {
        newErrors.empresa_id = 'Selecione uma empresa';
      }
      if (!formData.embarcacao_id) {
        newErrors.embarcacao_id = 'Selecione uma embarcação';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateEditForm = () => {
    const newErrors: Record<string, string> = {};

    if (!editFormData.role) {
      newErrors.role = 'Selecione um tipo';
    }

    if (editFormData.role === 'empresa_admin' && !editFormData.empresa_id) {
      newErrors.empresa_id = 'Selecione uma empresa';
    }
    
    if (editFormData.role === 'gerente_embarcacao') {
      if (!editFormData.empresa_id) {
        newErrors.empresa_id = 'Selecione uma empresa';
      }
      if (!editFormData.embarcacao_id) {
        newErrors.embarcacao_id = 'Selecione uma embarcação';
      }
    }

    setEditErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    try {
      await createUserMutation.mutateAsync({
        email: formData.email,
        password: formData.password,
        role: formData.role as UserRole,
        empresa_id: formData.empresa_id || undefined,
        embarcacao_id: formData.embarcacao_id || undefined,
      });

      setIsCreateDialogOpen(false);
      setFormData({ email: '', password: '', role: '', empresa_id: '', embarcacao_id: '' });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleEdit = async () => {
    if (!editingUser || !validateEditForm()) return;

    try {
      await updateUserMutation.mutateAsync({
        user_id: editingUser.id,
        role: editFormData.role as UserRole,
        empresa_id: editFormData.empresa_id || null,
        embarcacao_id: editFormData.embarcacao_id || null,
      });

      setEditingUser(null);
      setEditFormData({ role: '', empresa_id: '', embarcacao_id: '' });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const openEditModal = (usuario: SystemUser) => {
    setEditingUser(usuario);
    setEditFormData({
      role: usuario.role || '',
      empresa_id: usuario.empresa_id || '',
      embarcacao_id: usuario.embarcacao_id || '',
    });
    setEditErrors({});
  };

  const handleDelete = async (userId: string) => {
    try {
      await deleteUserMutation.mutateAsync(userId);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const canEditUser = (targetUser: SystemUser) => {
    // Can't edit yourself
    if (targetUser.id === user?.id) return false;
    
    // Super admin can edit anyone (except themselves)
    if (isSuperAdmin) return true;
    
    // Empresa admin can only edit gerente_embarcacao from their company
    if (isEmpresaAdmin) {
      return targetUser.role === 'gerente_embarcacao' && 
             targetUser.empresa_id === user?.empresa_id;
    }
    
    return false;
  };

  const canDeleteUser = (targetUser: SystemUser) => {
    // Can't delete yourself
    if (targetUser.id === user?.id) return false;
    
    // Super admin can delete anyone (except themselves)
    if (isSuperAdmin) return true;
    
    // Empresa admin can only delete gerente_embarcacao from their company
    if (isEmpresaAdmin) {
      return targetUser.role === 'gerente_embarcacao' && 
             targetUser.empresa_id === user?.empresa_id;
    }
    
    return false;
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Usuários do Sistema</h1>
            <p className="text-muted-foreground">Gerencie os usuários com acesso ao painel</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TableSkeleton rows={5} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuários do Sistema</h1>
          <p className="text-muted-foreground">Gerencie os usuários com acesso ao painel</p>
        </div>
        {availableRoles.length > 0 && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Preencha os dados para criar um novo usuário do sistema.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={errors.email ? 'border-destructive' : ''}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className={errors.password ? 'border-destructive' : ''}
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Tipo de Usuário *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => handleInputChange('role', value)}
                  >
                    <SelectTrigger className={errors.role ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map(role => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.role && <p className="text-sm text-destructive">{errors.role}</p>}
                </div>

                {(formData.role === 'empresa_admin' || formData.role === 'gerente_embarcacao') && (
                  <div className="space-y-2">
                    <Label htmlFor="empresa_id">Empresa *</Label>
                    <Select
                      value={formData.empresa_id}
                      onValueChange={(value) => handleInputChange('empresa_id', value)}
                      disabled={isEmpresaAdmin}
                    >
                      <SelectTrigger className={errors.empresa_id ? 'border-destructive' : ''}>
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {(isEmpresaAdmin 
                          ? empresas.filter(e => e.id === user?.empresa_id)
                          : empresas
                        ).map(empresa => (
                          <SelectItem key={empresa.id} value={empresa.id}>
                            {empresa.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.empresa_id && <p className="text-sm text-destructive">{errors.empresa_id}</p>}
                  </div>
                )}

                {formData.role === 'gerente_embarcacao' && (
                  <div className="space-y-2">
                    <Label htmlFor="embarcacao_id">Embarcação *</Label>
                    <Select
                      value={formData.embarcacao_id}
                      onValueChange={(value) => handleInputChange('embarcacao_id', value)}
                      disabled={!formData.empresa_id}
                    >
                      <SelectTrigger className={errors.embarcacao_id ? 'border-destructive' : ''}>
                        <SelectValue placeholder={formData.empresa_id ? "Selecione a embarcação" : "Selecione uma empresa primeiro"} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredEmbarcacoes.map(embarcacao => (
                          <SelectItem key={embarcacao.id} value={embarcacao.id}>
                            {embarcacao.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.embarcacao_id && <p className="text-sm text-destructive">{errors.embarcacao_id}</p>}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-role">Tipo de Usuário *</Label>
              <Select
                value={editFormData.role}
                onValueChange={(value) => handleEditInputChange('role', value)}
              >
                <SelectTrigger className={editErrors.role ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map(role => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editErrors.role && <p className="text-sm text-destructive">{editErrors.role}</p>}
            </div>

            {(editFormData.role === 'empresa_admin' || editFormData.role === 'gerente_embarcacao') && (
              <div className="space-y-2">
                <Label htmlFor="edit-empresa_id">Empresa *</Label>
                <Select
                  value={editFormData.empresa_id}
                  onValueChange={(value) => handleEditInputChange('empresa_id', value)}
                  disabled={isEmpresaAdmin}
                >
                  <SelectTrigger className={editErrors.empresa_id ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {(isEmpresaAdmin 
                      ? empresas.filter(e => e.id === user?.empresa_id)
                      : empresas
                    ).map(empresa => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editErrors.empresa_id && <p className="text-sm text-destructive">{editErrors.empresa_id}</p>}
              </div>
            )}

            {editFormData.role === 'gerente_embarcacao' && (
              <div className="space-y-2">
                <Label htmlFor="edit-embarcacao_id">Embarcação *</Label>
                <Select
                  value={editFormData.embarcacao_id}
                  onValueChange={(value) => handleEditInputChange('embarcacao_id', value)}
                  disabled={!editFormData.empresa_id}
                >
                  <SelectTrigger className={editErrors.embarcacao_id ? 'border-destructive' : ''}>
                    <SelectValue placeholder={editFormData.empresa_id ? "Selecione a embarcação" : "Selecione uma empresa primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {editFilteredEmbarcacoes.map(embarcacao => (
                      <SelectItem key={embarcacao.id} value={embarcacao.id}>
                        {embarcacao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editErrors.embarcacao_id && <p className="text-sm text-destructive">{editErrors.embarcacao_id}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Lista de Usuários
          </CardTitle>
          <CardDescription>
            Usuários com acesso ao painel de gerenciamento
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usuarios.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="Nenhum usuário encontrado"
              description="Não há usuários cadastrados no sistema."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Embarcação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Shield className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{usuario.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Criado em {new Date(usuario.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {usuario.role ? (
                        <Badge variant={roleBadgeVariants[usuario.role]}>
                          {roleLabels[usuario.role]}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Pendente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {usuario.empresa_nome ? (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {usuario.empresa_nome}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {usuario.embarcacao_nome ? (
                        <div className="flex items-center gap-1">
                          <Ship className="h-4 w-4 text-muted-foreground" />
                          {usuario.embarcacao_nome}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEditUser(usuario) && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openEditModal(usuario)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDeleteUser(usuario) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(usuario.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
