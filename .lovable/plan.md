
# Correção v7.1.25: Timing de Leitura de Arquivos no RouterOS 6.x

## Diagnóstico

Análise dos logs mostra um problema de timing:

| Script | Servidor | MikroTik (lido) | Status |
|--------|----------|-----------------|--------|
| sync-raw | 1996 bytes | **0 bytes** | FALHA |
| action-raw | 2709 bytes | 2709 bytes | OK |
| guardian-raw | 1993 bytes | **0 bytes** | FALHA |

O servidor está gerando todos os scripts corretamente. O problema está na leitura do arquivo no RouterOS após o fetch.

**Causa provável:** O RouterOS 6.x pode não ter sincronizado o arquivo completamente no disco antes da leitura. Arquivos menores (sync e guardian ~2KB) falham mais frequentemente que arquivos maiores (action ~2.7KB).

## Estratégia de Correção v7.1.25

### 1. Aumentar delay pós-fetch de 700ms para 1500ms

O delay atual de 700ms pode não ser suficiente para o flash do RouterOS sincronizar arquivos pequenos.

### 2. Adicionar retry na leitura do arquivo

Se o tamanho for 0 na primeira tentativa, esperar mais e tentar novamente:

```routeros
:delay 1500ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
  :set readRetry ($readRetry + 1)
  :do { :set fsize [/file get $syncTempFile size] } on-error={}
  :if ($fsize = 0) do={
    :log info ("NAVSPOT-INSTALL: sync read retry " . $readRetry . "/3")
    :delay 1000ms
  }
}
```

### 3. Validar tamanho mínimo antes de validar conteúdo

Se o arquivo tem 0 bytes, não tentar ler o conteúdo (evita erro):

```routeros
:if ($fsize < 50) do={
  :log error ("NAVSPOT-INSTALL: sync arquivo muito pequeno - " . $fsize . " bytes")
  # tentar novamente ou falhar
} else={
  # continuar com validação de conteúdo
}
```

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-scripts/index.ts`

**Mudanças em `generateAllScripts()`:**

1. Bump VERSION para "7.1.25"
2. Aumentar delay pós-fetch de 700ms para 1500ms (linhas 354, 396, 475)
3. Adicionar retry loop na leitura de tamanho do arquivo
4. Adicionar validação de tamanho mínimo (50 bytes)

### 2. Outros arquivos (version bump)

- `supabase/functions/mikrotik-sync/index.ts` - VERSION para 7.1.25
- `supabase/functions/mikrotik-script-generator/index.ts` - VERSION para 7.1.25
- `src/components/modals/ScriptModal.tsx` - scriptVersion para "7.1.25"
- `src/pages/Embarcacoes.tsx` - currentScriptVersion para "7.1.25"

## Código Atualizado - Lógica de Leitura com Retry

```routeros
:if ($syncOk = true) do={
:delay 1500ms
:local fsize 0
:local readRetry 0
:while (($fsize = 0) && ($readRetry < 3)) do={
:set readRetry ($readRetry + 1)
:do { :set fsize [/file get $syncTempFile size] } on-error={}
:if ($fsize = 0) do={
:log info ("NAVSPOT-INSTALL: sync read retry " . $readRetry . "/3")
:delay 1000ms
}
}
:log info ("NAVSPOT-INSTALL: sync baixado (" . $fsize . " bytes)")
:if ($fsize < 50) do={
:log error ("NAVSPOT-INSTALL: sync arquivo muito pequeno ou vazio")
:do { /file remove $syncTempFile } on-error={}
} else={
:local prefix ""
:do { :set prefix [:pick [/file get $syncTempFile contents] 0 100] } on-error={}
# ... resto da validação
}
}
```

## Verificação no MikroTik

```routeros
/import navspot-bootstrap-v7.1.25.rsc

# Verificar logs
/log print where message~"NAVSPOT-INSTALL" last=40

# Esperado:
# sync baixado (1996 bytes) - NÃO mais 0 bytes
# sync content valido
# action baixado (2709 bytes)
# action content valido
# guardian baixado (1993 bytes)
# guardian content valido
```

## Checklist de Implementação

- [ ] Aumentar delay pós-fetch de 700ms para 1500ms
- [ ] Adicionar retry loop na leitura de tamanho (3 tentativas)
- [ ] Adicionar validação de tamanho mínimo (50 bytes)
- [ ] Aplicar mesma lógica para sync, action e guardian
- [ ] Bump VERSION para 7.1.25 em todos os arquivos
- [ ] Deploy edge functions
- [ ] Testar no RouterOS 6.49.x
