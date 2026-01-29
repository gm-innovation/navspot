

# Correção: Aspas Duplas Aninhadas no RouterOS

## Problema Identificado

Na linha 432-433 do `mikrotik-script-generator/index.ts`:

```typescript
/system script add name="navspot-action-processor" policy=read,write,policy,test source="${actionProcessorSource}"
/system script add name="navspot-sync" policy=read,write,policy,test source="${syncScriptSource}"
```

Os scripts `syncScriptSource` e `actionProcessorSource` contêm aspas duplas internas (ex: `"navspot-token.txt"`, `"${syncUrl}"`). Quando interpolados dentro de `source="..."`, o RouterOS interpreta a primeira aspa interna como fechamento do `source=`, quebrando toda a sintaxe.

**Erro na linha 86, coluna 42**: O RouterOS vê `source=":local token [/file get "` e entende que o source terminou ali.

---

## Solução

Usar a sintaxe `source={ ... }` (bloco multilinha com chaves) ao invés de `source="..."`. Com chaves, aspas internas não precisam de escape.

---

## Mudanças no Arquivo

**Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`

### Mudança 1: Linhas 432-433 - Usar source={ } com chaves

**De:**
```typescript
/system script add name="navspot-action-processor" policy=read,write,policy,test source="${actionProcessorSource}"
/system script add name="navspot-sync" policy=read,write,policy,test source="${syncScriptSource}"
```

**Para:**
```typescript
/system script add name="navspot-action-processor" policy=read,write,policy,test source={
${actionProcessorSource}
}
/system script add name="navspot-sync" policy=read,write,policy,test source={
${syncScriptSource}
}
```

### Mudança 2: Remover escapes de aspas nos scripts source

Os scripts `syncScriptSource` (linhas 223-248) e `actionProcessorSource` (linhas 251-341) usam `\\"` para escapar aspas, que era necessário dentro de `source="..."`. Com `source={ }`, devemos usar aspas normais.

**syncScriptSource - Linha 234:**
```typescript
// De:
:local body ("{\\"sync_token\\":\\"" . $token . "\\",\\"active_users_csv\\":\\"" . $users . "\\"}")

// Para:
:local body ("{\"sync_token\":\"" . $token . "\",\"active_users_csv\":\"" . $users . "\"}")
```

Na verdade, como estamos gerando o script RSC que será executado diretamente pelo MikroTik (não em um terminal), as aspas devem ser normais sem escape de barra invertida.

---

## Correções Detalhadas

### syncScriptSource (Linhas 223-248)

```typescript
const syncScriptSource = `:local token [/file get "navspot-token.txt" contents]
:local syncUrl "${syncUrl}"
:local users ""
/ip hotspot active
:foreach a in=[find] do={
:local u [get \$a user]
:local m [get \$a mac-address]
:local bi [get \$a bytes-in]
:local bo [get \$a bytes-out]
:set users (\$users . \$u . "," . \$m . "," . \$bi . "," . \$bo . ";")
}
:local body ("{\\"sync_token\\":\\"" . \$token . "\\",\\"active_users_csv\\":\\"" . \$users . "\\"}")
:do {
:local result [/tool fetch url=\$syncUrl mode=https http-method=post http-data=\$body output=user as-value]
:if ((\$result->"status") = "finished") do={
:local resp (\$result->"data")
:local start [:find \$resp "[[ "]
:local end [:find \$resp " ]]"]
:if ((\$start >= 0) && (\$end >= 0)) do={
:local actions [:pick \$resp (\$start + 3) \$end]
:global navspotActions \$actions
/system script run navspot-action-processor
}
}
} on-error={:log warning "NAVSPOT-SYNC: Falha"}
:log info "NAVSPOT-SYNC: OK"`
```

**Nota**: Com `source={ }`, as aspas dentro do JSON (`{\\"sync_token\\"`) devem permanecer escapadas com `\\` porque é o RouterOS que vai interpretar isso como JSON literal.

### Bootstrap Template (Linhas 432-433)

```typescript
# 10. SYNC SCRIPT v6.5 + ACTION PROCESSOR
/system script add name="navspot-action-processor" policy=read,write,policy,test source={
${actionProcessorSource}
}
/system script add name="navspot-sync" policy=read,write,policy,test source={
${syncScriptSource}
}
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m on-event="navspot-sync" start-time=startup
:log info "NAVSPOT: Sync v6.5 + Action Processor configurados"
```

---

## Fluxo Após Correção

```text
1. Usuário importa navspot-bootstrap.rsc no MikroTik

2. Seção 10 é executada:
   /system script add name="navspot-action-processor" source={
   :global navspotActions
   :local rawData $navspotActions
   ...
   }
   
   /system script add name="navspot-sync" source={
   :local token [/file get "navspot-token.txt" contents]
   ...
   }

3. As aspas internas ("navspot-token.txt") são interpretadas corretamente
   porque estão dentro de source={ } e não source="..."

4. Scripts são criados sem erros de parsing
```

---

## Resumo

| Problema | Causa | Solução |
|----------|-------|---------|
| Erro linha 86, coluna 42 | Aspas duplas aninhadas em `source="..."` | Usar `source={ }` com chaves |
| Scripts não criados | RouterOS fecha o source prematuramente | Bloco multilinha evita conflitos |

