
# Plano: Correção das Regras de Acesso e Erro de UUID

## Status: ✅ IMPLEMENTADO

---

## Correções Aplicadas

### ✅ Problema 1: Erro "invalid input syntax for type uuid: ''"

**Arquivo modificado**: `src/pages/PerfisVelocidade.tsx`

**Solução**:
1. Adicionada validação antes de criar perfil - se `user?.empresa_id` for vazio, exibe erro
2. Para UPDATE: não envia `empresa_id` (usa o existente do perfil)
3. Para CREATE: valida e usa `user!.empresa_id!` garantido

---

### ✅ Problema 2: Regras de Firewall/Acesso Não Funcionam

**Arquivos modificados**: `src/hooks/useRegrasAcesso.ts`

**Solução**:
1. `useCreateRegraAcesso`: Agora busca a lista vinculada e envia payload com domínios expandidos
2. `useCreateMultipleRegras`: Para cada regra, busca a lista e cria ação individual com domínios
3. `useUpdateRegraAcesso`: Mesmo tratamento - busca lista e envia domínios no payload

**Fluxo corrigido**:
```
1. Criar Regra no frontend
2. Hook busca listas_acesso: { dominios, tipo, nome }
3. Cria ação com payload: { dominios: [...], tipo: 'whitelist'|'blacklist', ... }
4. mikrotik-sync expande cada domínio em comando individual (linhas 1019-1044)
5. MikroTik executa: create_whitelist_domain|lista|dominio
```

---

## Arquitetura Final

```text
┌─────────────────────────────────────────────────────────────────┐
│  FLUXO CORRIGIDO                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. useCreateRegraAcesso(regra)                                 │
│  2. Hook busca lista: { dominios, tipo }                        │
│  3. createMikrotikActionForEmpresa({                            │
│       tipo: 'add_walled_garden' | 'add_firewall_filter',        │
│       payload: { dominios: [...], tipo, lista_name }            │
│     })                                                          │
│  4. mikrotik-sync expande (linhas 1019-1044):                   │
│     - whitelist → create_whitelist_domain|lista|dominio         │
│     - blacklist → create_blacklist_domain|lista|dominio         │
│  5. MikroTik adiciona no walled-garden                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testes de Verificação

1. **Erro UUID**: Tentar criar perfil com super_admin sem empresa → deve mostrar toast de erro
2. **Criar Regra Whitelist**: Após criar, verificar em `acoes_pendentes` que payload contém domínios
3. **MikroTik**: Após sync, domínios devem aparecer em `/ip hotspot walled-garden print`
