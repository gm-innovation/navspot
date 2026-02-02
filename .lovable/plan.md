
# Plano: Correção das Regras de Acesso e Erro de UUID

## Diagnóstico dos Problemas

### Problema 1: Erro "invalid input syntax for type uuid: ''"

**Causa raiz**: Na linha 171 do arquivo `src/pages/PerfisVelocidade.tsx`:
```typescript
empresa_id: user?.empresa_id || "",
```

Quando o usuário é `super_admin` (que pode não ter `empresa_id` vinculado), o valor passado é uma string vazia `""`, que é inválida para uma coluna UUID NOT NULL no banco de dados.

**Impacto**: Impossibilita criar ou atualizar perfis de velocidade para super_admin.

---

### Problema 2: Regras de Firewall/Acesso Não Funcionam

**Causa raiz**: Existem múltiplas falhas na cadeia de sincronização de regras de acesso:

1. **Regras de acesso não geram ações quando vinculadas a perfil**:
   - O hook `useCreateRegraAcesso` envia tipo `add_firewall_filter` com payload `{ regra_id, action: 'add' }` (apenas o ID)
   - O `mikrotik-sync` tenta expandir `p.dominios` (linha 1031), mas o payload **NÃO contém** os domínios

2. **A lógica de firewall no mikrotik-sync não busca os domínios da lista**:
   - Na linha 874-896, o `mikrotik-sync` busca regras de acesso e extrai domínios da `listas_acesso`
   - Mas isso apenas retorna `firewall_rules` na resposta, **não cria ações pendentes**
   - O MikroTik precisa de **comandos individuais** (`create_whitelist_domain` / `create_blacklist_domain`)

3. **O modo "bloquear_tudo" do perfil não é traduzido para o MikroTik**:
   - O perfil tem `modo_acesso: 'bloquear_tudo'`, mas não há nenhuma lógica que:
     - Configure o hotspot profile para modo restritivo
     - Crie regras de walled garden para as exceções (whitelists)
     - Crie regras de blacklist no firewall

4. **Whitelist vs Blacklist no walled-garden**:
   - `action=allow` no walled-garden **permite** acesso mesmo SEM login
   - `action=deny` **bloqueia** acesso
   - Mas para `modo_acesso='bloquear_tudo'`, deveria ser o inverso: bloquear tudo EXCETO as whitelists

---

## Soluções Propostas

### Correção 1: Validação de empresa_id no formulário

**Arquivo**: `src/pages/PerfisVelocidade.tsx`

**Mudanças**:
1. Buscar `empresa_id` do perfil existente ao editar (não do user)
2. Para criação por super_admin, exigir seleção de empresa
3. Adicionar validação antes de submeter

```typescript
// No handleSubmit:
const dataToSubmit = {
  // ...outros campos
  // Para UPDATE: NÃO incluir empresa_id (usa o existente)
  // Para CREATE: validar que não está vazio
  ...(editingPerfil ? {} : { empresa_id: user?.empresa_id }),
};

// Validação antes de criar
if (!editingPerfil && !user?.empresa_id) {
  toast({ title: 'Erro', description: 'Empresa não identificada', variant: 'destructive' });
  return;
}
```

---

### Correção 2: Implementar sincronização real de regras de acesso

**Arquivos**: 
- `supabase/functions/mikrotik-sync/index.ts`
- `src/hooks/useRegrasAcesso.ts`

**Mudanças**:

A. **Modificar o payload das ações de regra** no hook:
```typescript
// useCreateRegraAcesso
const { data: lista } = await supabase
  .from('listas_acesso')
  .select('dominios, tipo, nome')
  .eq('id', regra.lista_id)
  .single();

await createMikrotikActionForEmpresa({
  empresaId: data.empresa_id,
  tipo: lista.tipo === 'whitelist' ? 'add_walled_garden' : 'add_firewall_filter',
  payload: { 
    lista_name: lista.nome,
    tipo: lista.tipo,
    dominios: lista.dominios,
    perfil_id: data.perfil_id,
  },
});
```

B. **Adicionar lógica de modo de acesso no mikrotik-sync**:
```typescript
// Quando sincronizar perfis, também enviar regras vinculadas
if (perfil.modo_acesso === 'bloquear_tudo') {
  // Buscar regras deste perfil
  // Para cada whitelist vinculada → create_whitelist_domain
  // Para cada blacklist vinculada → create_blacklist_domain
}
```

---

### Correção 3: Sincronizar regras ao criar/atualizar perfil

**Arquivo**: `src/hooks/usePerfisVelocidade.ts`

**Mudanças**:
- Após criar/atualizar perfil, buscar regras vinculadas e gerar ações
- Para cada regra do perfil, buscar domínios da lista e criar ações individuais

---

## Arquitetura Proposta de Sincronização

```text
┌─────────────────────────────────────────────────────────────────┐
│  FLUXO ATUAL (QUEBRADO)                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Criar Regra → payload: { regra_id } (sem domínios)         │
│  2. mikrotik-sync recebe → tenta expandir p.dominios            │
│  3. p.dominios é undefined → NADA acontece                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  FLUXO CORRIGIDO                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Criar Regra                                                 │
│  2. Hook busca lista: { dominios, tipo }                        │
│  3. Para cada domínio:                                          │
│     - Se whitelist → add_walled_garden(domain, action=allow)    │
│     - Se blacklist → add_walled_garden(domain, action=deny)     │
│  4. mikrotik-sync recebe ações expandidas                       │
│  5. MikroTik adiciona regras no walled-garden                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Observação sobre Limitações do MikroTik

O MikroTik Hotspot Walled Garden funciona assim:
- **ANTES** do login: walled-garden define o que pode/não pode acessar
- **DEPOIS** do login: o usuário tem acesso normal (ou restrito por firewall)

Para implementar `modo_acesso='bloquear_tudo'` (modo restritivo por perfil), precisamos:
1. Criar firewall rules com `layer7-protocol` ou `address-list`
2. Vincular ao perfil do hotspot ou ao usuário específico

Isso é mais complexo e requer comandos adicionais no action-processor.

---

## Arquivos a Modificar

| Prioridade | Arquivo | Mudança |
|------------|---------|---------|
| **P0** | `src/pages/PerfisVelocidade.tsx` | Corrigir empresa_id vazio |
| **P1** | `src/hooks/useRegrasAcesso.ts` | Incluir domínios no payload |
| **P1** | `src/hooks/useListasAcesso.ts` | Garantir domínios expandidos |
| **P2** | `supabase/functions/mikrotik-sync/index.ts` | Sincronizar regras por perfil |
| **P3** | `supabase/functions/mikrotik-script-generator/index.ts` | Adicionar suporte a firewall rules |

---

## Testes de Aceitação

1. **Erro UUID**: Super admin consegue criar/editar perfil após selecionar empresa
2. **Regras Whitelist**: Domínios permitidos aparecem em `/ip hotspot walled-garden print`
3. **Regras Blacklist**: Domínios bloqueados aparecem com `action=deny`
4. **Modo Restritivo**: Perfil com `bloquear_tudo` + whitelists funciona corretamente
