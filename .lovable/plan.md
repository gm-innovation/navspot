# Plano: Correção v6.9.27 - CONCLUÍDO ✅

## Status: IMPLEMENTADO

Data: 2026-02-03

## Mudanças Realizadas

### 1. `supabase/functions/mikrotik-recovery-download/index.ts`
- ✅ Versão atualizada para 6.9.27
- ✅ Action-processor: `create_whitelist_domain` e `create_blacklist_domain` agora usam comando direto com `on-error={}` (sem verificação prévia com `[:len [/... find ...]]`)
- ✅ Netwatch: usa padrão remove+add (sem `[:len [/... find ...]]`)
- ✅ Walled Garden hostnames: 14 entradas convertidas para remove+add
- ✅ Walled Garden IP: 5 entradas convertidas para remove+add por comment exato
- ✅ Função `validateRouterOSScript()` adicionada como linter para detectar padrões proibidos

### 2. `supabase/functions/mikrotik-script-generator/index.ts`
- ✅ Versão atualizada para 6.9.27
- ✅ Action-processor: comandos diretos com `on-error={}` para whitelist/blacklist
- ✅ Interface list: usa `add` direto com `on-error={}` para duplicatas
- ✅ Firewall rules: usa remove+add com `place-before=0` para manter posição
- ✅ Netwatch: usa padrão remove+add
- ✅ Função `validateRouterOSScript()` adicionada

### 3. Frontend
- ✅ `src/components/modals/ScriptModal.tsx`: versão default 6.9.27
- ✅ `src/pages/Embarcacoes.tsx`: versão default 6.9.27

## Padrão Aplicado

**ANTES (quebrava no RouterOS 6.x durante /import):**
```routeros
:if ([:len [/ip hotspot walled-garden ip find dst-port=53 protocol=udp comment~"navspot-dns"]] = 0) do={
  /ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
}
```

**DEPOIS (v6.9.27 - funciona em 6.x e 7.x):**
```routeros
:do { /ip hotspot walled-garden ip remove [find comment="navspot-dns-udp"] } on-error={}
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns-udp"
```

## Validação Automática

Ambos os scripts agora passam por validação antes de serem retornados:

```typescript
function validateRouterOSScript(script: string, context: string): void {
  const forbiddenPatterns = [
    { regex: /:if \(\[:len \[\//, desc: '[:len [/... (nested brackets)' },
    { regex: /comment~"/, desc: 'comment~ (must use comment=)' },
  ]
  // Lança erro se encontrar padrões proibidos
}
```

## Como Testar

1. Baixar Recovery v6.9.27 pelo painel
2. No MikroTik:
   ```routeros
   /import navspot-recovery-v6.9.27.rsc
   ```
3. Verificar:
   ```routeros
   /log print where message~"NAVSPOT-RECOVERY"
   /ip hotspot walled-garden print
   /ip hotspot walled-garden ip print
   /system script print where name~"navspot"
   ```

## Notas Importantes

- O comment usado no `remove` é EXATAMENTE igual ao usado no `add` (ex: `navspot-dns-udp`)
- Firewall filter rules usam `place-before=0` para garantir posição no topo
- O linter valida scripts antes de retorná-los, evitando deploy de scripts quebrados
