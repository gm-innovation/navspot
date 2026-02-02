
# Plano: Visibilidade do Status de Bloqueio/Desconexão do Tripulante

## Problema Identificado

Atualmente, quando um tripulante é deslogado ou bloqueado automaticamente (ex: por exceder quota de dados), essa informação **não é visível** para o administrador na lista de tripulantes nem no modal de detalhes.

O sistema já:
- Gera alertas (`quota_exceeded`, `device_limit`, `blocked_device_attempt`, etc.)
- Envia ação `kick_session` para desconectar usuários que excederam quota
- Possui a tabela `alertas` com `tripulante_id` vinculado

O sistema **NÃO**:
- Mostra o motivo do bloqueio na lista de tripulantes
- Exibe alertas recentes relacionados ao tripulante
- Diferencia entre "bloqueado manualmente" vs "bloqueado por quota"
- Mostra barra de progresso da quota consumida

---

## Solução Proposta

### 1. Adicionar campo `bloqueio_motivo` na tabela `tripulantes`

**Migration SQL:**
```sql
ALTER TABLE tripulantes 
ADD COLUMN IF NOT EXISTS bloqueio_motivo TEXT,
ADD COLUMN IF NOT EXISTS bloqueado_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS bloqueado_por UUID REFERENCES auth.users(id);

COMMENT ON COLUMN tripulantes.bloqueio_motivo IS 'Motivo do bloqueio (manual, quota_exceeded, device_limit, etc)';
```

### 2. Atualizar `useTripulantes.ts` para incluir informações de quota

**Mudanças no query:**
```typescript
// Adicionar dados do perfil para calcular % da quota
.select(`
  *,
  embarcacoes(nome, empresas(nome)),
  perfis_velocidade(nome, limite_dados_mb, max_dispositivos)
`)
```

**Novo campo no TripulanteWithDetails:**
```typescript
interface TripulanteWithDetails extends Tripulante {
  // ... campos existentes
  limite_dados_mb?: number | null;
  max_dispositivos?: number;
  quota_percentual?: number; // Calculado: (bytes_consumidos / limite_dados_mb) * 100
  bloqueio_motivo?: string | null;
  bloqueado_at?: string | null;
}
```

### 3. Criar hook `useTripulanteAlertas` para buscar alertas recentes

**Arquivo:** `src/hooks/useTripulanteAlertas.ts`

```typescript
export function useTripulanteAlertas(tripulanteId: string | undefined) {
  return useQuery({
    queryKey: ['tripulante-alertas', tripulanteId],
    queryFn: async () => {
      if (!tripulanteId) return [];
      
      const { data, error } = await supabase
        .from('alertas')
        .select('id, tipo, severidade, mensagem, created_at, resolvido')
        .eq('tripulante_id', tripulanteId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: !!tripulanteId,
  });
}
```

### 4. Atualizar coluna Status na lista de tripulantes

**Arquivo:** `src/pages/Tripulantes.tsx` (linhas 362-375)

**Antes:**
```
[Badge: Ativo/Bloqueado/Inativo]
```

**Depois:**
```
[Badge: Ativo/Bloqueado/Inativo]
[SubBadge: Quota 85% ⚠️] (se > 80%)
[Tooltip: "Bloqueado por: Quota de dados excedida"]
```

**Código:**
```tsx
<TableCell>
  <div className="flex flex-col gap-1">
    <Badge variant={...}>
      {tripulante.status}
    </Badge>
    
    {/* Indicador de quota */}
    {tripulante.quota_percentual !== undefined && tripulante.quota_percentual > 80 && (
      <Badge variant="outline" className={
        tripulante.quota_percentual >= 100 
          ? "border-red-500 text-red-500" 
          : "border-yellow-500 text-yellow-500"
      }>
        Quota: {tripulante.quota_percentual.toFixed(0)}%
      </Badge>
    )}
    
    {/* Motivo do bloqueio */}
    {tripulante.status === 'bloqueado' && tripulante.bloqueio_motivo && (
      <Tooltip>
        <TooltipTrigger>
          <span className="text-xs text-muted-foreground">
            {formatBloqueioMotivo(tripulante.bloqueio_motivo)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Motivo: {tripulante.bloqueio_motivo}
        </TooltipContent>
      </Tooltip>
    )}
  </div>
</TableCell>
```

### 5. Atualizar Modal de Detalhes do Tripulante

**Arquivo:** `src/components/modals/TripulanteDetailsModal.tsx`

**Adicionar nova tab "Alertas" ou seção no tab "Consumo":**

```tsx
// Nova aba ou seção
<TabsContent value="consumo">
  {/* Barra de progresso da quota */}
  {tripulante.limite_dados_mb && (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm">Quota de Dados</span>
          <span className="text-sm font-medium">
            {formatBytes(tripulante.bytes_consumidos)} / {tripulante.limite_dados_mb} MB
          </span>
        </div>
        <Progress 
          value={quotaPercentual} 
          className={quotaPercentual >= 100 ? "bg-red-200" : quotaPercentual >= 80 ? "bg-yellow-200" : ""}
        />
        {quotaPercentual >= 100 && (
          <p className="text-xs text-red-500 mt-1">
            Quota excedida - usuário será desconectado automaticamente
          </p>
        )}
      </CardContent>
    </Card>
  )}

  {/* Alertas recentes */}
  <Card className="mt-4">
    <CardHeader>
      <CardTitle className="text-sm">Alertas Recentes</CardTitle>
    </CardHeader>
    <CardContent>
      {alertas?.length > 0 ? (
        <div className="space-y-2">
          {alertas.map(alerta => (
            <div key={alerta.id} className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className={getSeveridadeColor(alerta.severidade)}>
                {alerta.severidade}
              </Badge>
              <span className="text-muted-foreground">{alerta.mensagem}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(alerta.created_at))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum alerta recente</p>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

### 6. Atualizar `mikrotik-sync` para registrar motivo de bloqueio

**Arquivo:** `supabase/functions/mikrotik-sync/index.ts`

Quando a quota é excedida (linha ~614-627):
```typescript
if (percentage >= 100) {
  // Atualizar tripulante com motivo do bloqueio
  await supabase
    .from('tripulantes')
    .update({
      status: 'bloqueado',
      bloqueio_motivo: 'quota_exceeded',
      bloqueado_at: new Date().toISOString()
    })
    .eq('id', tripulante.id);
  
  // ... criar alerta e kick existentes
}
```

### 7. Atualizar ação de bloqueio manual para incluir motivo

**Arquivo:** `src/pages/Tripulantes.tsx` - handleBlock (linhas 148-157)

```typescript
const handleBlock = (tripulante: TripulanteWithDetails) => {
  const newStatus = tripulante.status === "bloqueado" ? "ativo" : "bloqueado";
  updateTripulante.mutate({ 
    id: tripulante.id, 
    status: newStatus,
    bloqueio_motivo: newStatus === 'bloqueado' ? 'manual' : null,
    bloqueado_at: newStatus === 'bloqueado' ? new Date().toISOString() : null
  });
  // ... resto do código
};
```

---

## Arquivos a Modificar/Criar

| Prioridade | Arquivo | Ação |
|------------|---------|------|
| **P0** | Migration | Adicionar `bloqueio_motivo`, `bloqueado_at` em `tripulantes` |
| **P1** | `src/hooks/useTripulantes.ts` | Incluir dados de perfil (limite_dados_mb) no query |
| **P1** | `src/hooks/useTripulanteAlertas.ts` | Criar hook para buscar alertas do tripulante |
| **P1** | `src/pages/Tripulantes.tsx` | Exibir indicador de quota e motivo de bloqueio |
| **P2** | `src/components/modals/TripulanteDetailsModal.tsx` | Adicionar barra de quota e lista de alertas |
| **P2** | `supabase/functions/mikrotik-sync/index.ts` | Registrar motivo ao bloquear por quota |

---

## Fluxo Visual Final

```
┌─────────────────────────────────────────────────────────────────┐
│  LISTA DE TRIPULANTES                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Nome           Status            Consumo     Último Login      │
│  ─────────────  ────────────────  ──────────  ──────────────    │
│  João Silva     [Ativo]           45.2 MB     há 2 min          │
│                 Quota: 45%                                      │
│                                                                 │
│  Maria Santos   [Bloqueado]       100.5 MB    há 15 min         │
│                 Quota: 101% 🔴                                  │
│                 "Quota excedida"                                │
│                                                                 │
│  Pedro Oliveira [Ativo]           82.1 MB     há 5 min          │
│                 Quota: 82% ⚠️                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testes de Aceitação

1. **Indicador de Quota**: Tripulante com consumo > 80% exibe badge amarelo
2. **Bloqueio por Quota**: Quando quota atinge 100%, status muda para "Bloqueado" com motivo "Quota excedida"
3. **Bloqueio Manual**: Administrador bloqueia tripulante, motivo aparece como "Manual"
4. **Modal de Detalhes**: Exibe barra de progresso da quota e lista de alertas recentes
5. **Desbloqueio**: Ao desbloquear, campos `bloqueio_motivo` e `bloqueado_at` são limpos
