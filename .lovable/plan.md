
# Plano: Corrigir Exibição de Status + Configurar login-url no Recovery

## Diagnóstico

### Problema 1: Status "Inativo" na tabela (BUG)
O banco de dados está correto (`status: 'pendente_cadastro'`), mas a tabela na página Tripulantes mostra "Inativo" porque o código só trata `ativo` e `bloqueado`.

**Linha 401 de Tripulantes.tsx:**
```typescript
{tripulante.status === "ativo" ? "Ativo" : tripulante.status === "bloqueado" ? "Bloqueado" : "Inativo"}
```

### Problema 2: Portal não abre (BUG CRÍTICO)
O Recovery script **não configura a login-url do hotspot profile**. Sem essa configuração, o MikroTik não redireciona clientes para o portal externo.

O Bootstrap script configura corretamente:
```routeros
/ip hotspot profile add ... login-url="https://navspot.lovable.app/hotspot-login?..."
```

Mas o Recovery diz: *"It does NOT touch network config (bridge, DHCP, NAT, hotspot)"*.

Isso significa que se o hotspot profile não estiver configurado corretamente, o Recovery não conserta.

---

## Soluções

### Correção 1: Exibir status "Pendente Cadastro" corretamente

**Arquivo:** `src/pages/Tripulantes.tsx`

Atualizar a lógica de exibição do badge de status para incluir `pendente_cadastro`:

```typescript
// Linha ~391-402
<Badge 
  variant={tripulante.status === "ativo" ? "default" : "secondary"}
  className={
    tripulante.status === "ativo" 
      ? "bg-green-100 text-green-800..." 
      : tripulante.status === "bloqueado"
      ? "bg-red-100 text-red-800..."
      : tripulante.status === "pendente_cadastro"
      ? "bg-yellow-100 text-yellow-800..."  // Amarelo para pendente
      : "bg-gray-100 text-gray-800..."
  }
>
  {tripulante.status === "ativo" ? "Ativo" 
    : tripulante.status === "bloqueado" ? "Bloqueado" 
    : tripulante.status === "pendente_cadastro" ? "Pendente Cadastro"
    : "Inativo"}
</Badge>
```

### Correção 2: Recovery deve verificar/corrigir login-url do hotspot profile

**Arquivo:** `supabase/functions/mikrotik-recovery-download/index.ts`

Adicionar seção no Recovery script para verificar e corrigir o hotspot profile:

```routeros
# 6. HOTSPOT PROFILE - Verificar/corrigir login-url para portal externo v6.9.24
:log info "NAVSPOT-RECOVERY: Verificando hotspot profile..."
:local hsprofName "hsprof-navspot"
:local correctLoginUrl "https://navspot.lovable.app/hotspot-login?h=${hotspotId}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"

:local hsprof [/ip hotspot profile find name=$hsprofName]
:if ([:len $hsprof] > 0) do={
  :local currentLoginUrl [/ip hotspot profile get $hsprof login-url]
  :if ($currentLoginUrl != $correctLoginUrl) do={
    /ip hotspot profile set $hsprof login-url=$correctLoginUrl html-directory=""
    :log info "NAVSPOT-RECOVERY: login-url corrigida no hotspot profile"
  }
} else={
  # Se nao existe o profile, o bootstrap completo e necessario
  :log warning "NAVSPOT-RECOVERY: Hotspot profile nao encontrado - execute bootstrap completo"
}
```

### Correção 3: Mesma lógica no script-generator (consistência)

**Arquivo:** `supabase/functions/mikrotik-script-generator/index.ts`

Garantir que o Bootstrap script use a mesma versão e padrões.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Tripulantes.tsx` | Adicionar tratamento visual para status `pendente_cadastro` (amarelo) |
| `supabase/functions/mikrotik-recovery-download/index.ts` | Adicionar verificação/correção da `login-url` no hotspot profile + bump para v6.9.24 |
| `supabase/functions/mikrotik-script-generator/index.ts` | Bump para v6.9.24 (consistência) |

---

## Workaround Imediato (MikroTik)

Enquanto implementamos, você pode corrigir manualmente no terminal do MikroTik:

```routeros
# Verificar qual login-url esta configurada
/ip hotspot profile print

# Corrigir manualmente (substitua pelo ID real do hotspot)
/ip hotspot profile set hsprof-navspot login-url="https://navspot.lovable.app/hotspot-login?h=27a1e1be-4ba7-4496-adb1-9227d3a80ad1&mac=\$(mac)&ip=\$(ip)&link-login-only=\$(link-login-only)" html-directory=""
```

---

## Teste Após Implementação

1. **Frontend**: Verificar que o tripulante mostra "Pendente Cadastro" (amarelo) em vez de "Inativo"
2. **MikroTik**: Baixar e importar Recovery v6.9.24
3. **WiFi**: Conectar dispositivo - portal deve abrir automaticamente
4. **Formulário**: Para usuário `pendente_cadastro`, deve aparecer formulário de conclusão de cadastro

---

## Resultado Esperado

- Badge amarelo "Pendente Cadastro" na tabela de tripulantes
- Portal de autenticação abre ao conectar no WiFi
- Formulário de cadastro aparece para tripulantes pendentes
- Após preencher formulário, status muda para "Ativo" e acesso é liberado
