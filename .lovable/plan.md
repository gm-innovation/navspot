
# Plano: Corrigir Blacklist e Clarificar Fluxo de Cadastro

## Diagnóstico

### Problema 1: Formulário de cadastro
**NÃO é um bug** - o usuário `alexandre.silva` já está com status `ativo`, então o sistema corretamente redireciona para autenticação no MikroTik. O formulário de cadastro só aparece para usuários com status `pendente_cadastro`.

**Para testar o formulário**: Crie um novo tripulante com status `pendente_cadastro` e tente logar com ele.

### Problema 2: Blacklist não funciona
Este é o bug real. Analisando os logs:
- Apenas `create_whitelist_domain` está sendo processado
- Nenhuma ação `create_blacklist_domain` aparece no pipe
- Motivo: O hash de firewall não mudou, então o sync não reinjecta as regras

**Causa raiz**: O mecanismo de hash-caching impede que as regras sejam reaplicadas quando necessário. Além disso, no MikroTik as Address-Lists têm `timeout=1d`, então os IPs expiram após 24h e o bloqueio para de funcionar.

## Soluções Propostas

### Correção 1: Forçar resync do firewall
Resetar o `firewall_rules_hash` do hotspot para forçar o backend a reinjetar todas as regras de blacklist/whitelist.

**Ação SQL**:
```sql
UPDATE hotspots 
SET firewall_rules_hash = NULL 
WHERE nome = 'Engenharia Googlemarine';
```

### Correção 2: Corrigir timeout das Address-Lists (código)
Atualmente o código usa `timeout=1d` (linha 490), o que faz os IPs expirarem. Precisa mudar para `timeout=none` para blacklist também (já está correto para whitelist).

**Arquivo**: `supabase/functions/mikrotik-recovery-download/index.ts`

**Mudança na linha 490**:
```routeros
# DE:
/ip firewall address-list add list="NAVSPOT-BLACKLIST" address=$resolvedIp timeout=1d comment=("navspot-" . $domain)

# PARA:
/ip firewall address-list add list="NAVSPOT-BLACKLIST" address=$resolvedIp timeout=none comment=("navspot-" . $domain)
```

### Correção 3: Mesmo fix no script-generator
Garantir que o script de bootstrap também use `timeout=none`.

**Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-recovery-download/index.ts` | Mudar `timeout=1d` para `timeout=none` na Address-List BLACKLIST (linha 490) |
| `supabase/functions/mikrotik-script-generator/index.ts` | Mesma correção para consistência |

## Passos Após Implementação

1. **Resetar hash no banco** (executar SQL acima ou via painel)
2. **Deploy das Edge Functions atualizadas**
3. **Aguardar próximo sync** (1 minuto) - as regras serão reinjetadas
4. **Verificar no MikroTik**:
   ```routeros
   /ip hotspot walled-garden print where comment~"navspot-blacklist"
   /ip firewall address-list print where list="NAVSPOT-BLACKLIST"
   ```
5. **Testar**: Acessar facebook.com ou instagram.com - deve bloquear

## Sobre o Formulário de Cadastro

Para testar se o formulário funciona:
1. Acesse o painel → Tripulantes
2. Crie um novo tripulante com status "Pendente de Cadastro"
3. Conecte ao WiFi com as credenciais desse novo tripulante
4. O formulário de cadastro deve aparecer

## Resultado Esperado

- **Blacklist funcionando**: Facebook, Instagram, YouTube, Netflix bloqueados
- **Whitelist funcionando**: Gmail, Google, Office365 liberados
- **Formulário de cadastro**: Aparece apenas para tripulantes com status `pendente_cadastro`
