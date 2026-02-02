
# Plano v6.9.17 - CONCLUÍDO

## Correções Aplicadas

### ✅ 1. Corrigir Sintaxe RouterOS 6.x

**Problema:** `action=reject` inválido em `/ip hotspot walled-garden` (hostnames)

**Correção:** Alterado para `action=deny` em:
- `mikrotik-recovery-download/index.ts` (linha 320-321)
- `mikrotik-script-generator/index.ts` (linha 441)

### ✅ 2. Implementar modo_acesso "bloquear_tudo"

**Problema:** Perfis restritivos não bloqueavam tráfego pós-login

**Correção:** Adicionado novo handler `add_firewall_allow` que:
- Cria Address-List `NAVSPOT-ALLOWED` com IPs permitidos
- Cria regra ACCEPT para essa lista
- Cria regra DROP para todo o resto

Arquivos modificados:
- `mikrotik-recovery-download/index.ts` - Novo handler no action-processor
- `mikrotik-script-generator/index.ts` - Novo handler no action-processor
- `mikrotik-sync/index.ts` - Detecta perfis com `modo_acesso = 'bloquear_tudo'` e injeta ações

### ✅ 3. Reset do firewall_rules_hash

Executado via SQL para forçar reenvio das regras no próximo sync.

## Próximos Passos - No MikroTik

1. **Limpar scripts antigos:**
```routeros
/system script remove [find name~"navspot"]
/system scheduler remove [find name="navspot-sync-scheduler"]
```

2. **Aplicar novo recovery** (copie o script abaixo no terminal):
```routeros
# Será gerado pela Edge Function corrigida
```

3. **Ou gerar novo script via UI:**
   - Acesse Embarcações
   - Clique no ícone `</>` para gerar novo script

4. **Verificar aplicação:**
```routeros
/log print where message~"NAVSPOT"
/ip hotspot walled-garden print where comment~"navspot"
/ip firewall filter print where comment~"NAVSPOT"
/ip firewall address-list print where list~"NAVSPOT"
```

## Resumo Técnico

| Arquivo | Mudança |
|---------|---------|
| `mikrotik-recovery-download` | `action=reject` → `action=deny` + novo `add_firewall_allow` |
| `mikrotik-script-generator` | `action=reject` → `action=deny` + novo `add_firewall_allow` |
| `mikrotik-sync` | Detecção de perfis restritivos + injeção de `add_firewall_allow` |

## Notas

- O consumo voltará a atualizar assim que o usuário conseguir navegar
- O hash foi resetado, então o próximo sync enviará todas as regras
- Perfis com `modo_acesso = 'bloquear_tudo'` agora funcionarão corretamente
