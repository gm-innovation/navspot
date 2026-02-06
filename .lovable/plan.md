

# Plano v7.1.50: Refatorar CLEANUP com Foreach e Regex Ancorado

## Problema Identificado

O erro "expected end of command (line 10 column 49)" ocorre nas linhas 318-339 do `mikrotik-script-generator/index.ts`:

```routeros
:do { /file remove [find where name="navspot-token.txt"] } on-error={}
```

A coluna 49 corresponde exatamente à aspa dupla do `name="navspot-token.txt"`, causando conflito de parsing no RouterOS quando aninhada dentro de `:do { }`.

---

## Solucao

Refatorar toda a secao de CLEANUP (linhas 317-341) usando:

1. **Loops foreach** - evita aspas aninhadas problemáticas
2. **Regex ancorado** (`^navspot-`) - previne remocoes acidentais
3. **Logs de auditoria** - registra o que será removido
4. **Ordem segura** - scripts/schedulers antes de bridges/interfaces

---

## Codigo ANTES (Linhas 317-341)

```routeros
# 0. CLEANUP
:log info "NAVSPOT v${VERSION}: Limpando instalacoes anteriores..."
:do { /file remove [find where name="navspot-token.txt"] } on-error={}
:do { /file remove [find where name="navspot-resp.txt"] } on-error={}
:do { /file remove [find where name="navspot-recovery.rsc"] } on-error={}
:do { /file remove [find where name="ns-install.rsc"] } on-error={}
:do { /system script remove [find where name="navspot-sync"] } on-error={}
:do { /system script remove [find where name="navspot-action-processor"] } on-error={}
:do { /system script remove [find where name="navspot-guardian"] } on-error={}
:do { /system scheduler remove [find where name="navspot-sync-scheduler"] } on-error={}
:do { /system scheduler remove [find where name="navspot-guardian-scheduler"] } on-error={}
:do { /tool netwatch remove [find where comment="navspot-netwatch"] } on-error={}
:do { /ip hotspot remove [find name="hs-navspot"] } on-error={}
:do { /ip hotspot profile remove [find name="hsprof-navspot"] } on-error={}
:do { /ip dhcp-server remove [find name="dhcp-navspot"] } on-error={}
:do { /ip dhcp-server network remove [find comment="navspot"] } on-error={}
:do { /ip pool remove [find name="hs-pool-navspot"] } on-error={}
:do { /ip address remove [find comment="navspot"] } on-error={}
:do { /ip firewall nat remove [find comment="navspot-nat"] } on-error={}
:do { /ip hotspot walled-garden remove [find comment="navspot-initial"] } on-error={}
:do { /ip hotspot walled-garden ip remove [find comment="navspot-initial"] } on-error={}
:do { /interface bridge port remove [find comment="navspot-lan"] } on-error={}
:do { /interface bridge remove [find name="bridge1"] } on-error={}
:do { /ip dhcp-client remove [find comment="navspot-wan"] } on-error={}
:delay 2s
:log info "NAVSPOT v${VERSION}: Cleanup concluido"
```

---

## Codigo DEPOIS (Foreach + Regex Ancorado)

```routeros
# 0. CLEANUP (safe - foreach + regex ancorado)
:log info "NAVSPOT v${VERSION}: Limpando instalacoes anteriores..."

# 1. Arquivos (regex ancorado ^navspot-)
:foreach f in=[/file find where name~"^navspot-"] do={
:log info ("CLEANUP: removendo arquivo ".[/file get $f name])
/file remove $f
}
:foreach f in=[/file find where name~"^ns-install"] do={/file remove $f}

# 2. Scripts e Schedulers (antes de infraestrutura)
:foreach f in=[/system script find where name~"^navspot-"] do={
:log info ("CLEANUP: removendo script ".[/system script get $f name])
/system script remove $f
}
:foreach f in=[/system scheduler find where name~"^navspot-"] do={/system scheduler remove $f}
:foreach f in=[/tool netwatch find where comment~"navspot"] do={/tool netwatch remove $f}

# 3. Hotspot (antes de pool/network)
:foreach f in=[/ip hotspot find where name~"^hs-navspot$"] do={/ip hotspot remove $f}
:foreach f in=[/ip hotspot profile find where name~"^hsprof-navspot$"] do={/ip hotspot profile remove $f}

# 4. DHCP e Pool
:foreach f in=[/ip dhcp-server find where name~"^dhcp-navspot$"] do={/ip dhcp-server remove $f}
:foreach f in=[/ip dhcp-server network find where comment~"navspot"] do={/ip dhcp-server network remove $f}
:foreach f in=[/ip pool find where name~"^hs-pool-navspot$"] do={/ip pool remove $f}

# 5. Enderecos e NAT
:foreach f in=[/ip address find where comment~"navspot"] do={/ip address remove $f}
:foreach f in=[/ip firewall nat find where comment~"navspot"] do={/ip firewall nat remove $f}

# 6. Walled Garden
:foreach f in=[/ip hotspot walled-garden find where comment~"navspot"] do={/ip hotspot walled-garden remove $f}
:foreach f in=[/ip hotspot walled-garden ip find where comment~"navspot"] do={/ip hotspot walled-garden ip remove $f}

# 7. Bridge ports (ANTES de remover bridge)
:foreach f in=[/interface bridge port find where comment~"navspot"] do={/interface bridge port remove $f}
# Bridge: so remove se comment contem navspot (protege bridges de usuario)
:foreach f in=[/interface bridge find where comment~"navspot"] do={/interface bridge remove $f}

# 8. DHCP Client WAN
:foreach f in=[/ip dhcp-client find where comment~"navspot"] do={/ip dhcp-client remove $f}

:delay 2s
:log info "NAVSPOT v${VERSION}: Cleanup concluido"
```

---

## Mudancas Principais

| Antes | Depois |
|-------|--------|
| `:do { /file remove [find name="..."] }` | `:foreach f in=[find name~"^..."] do={remove $f}` |
| Aspas aninhadas | Regex ancorado (sem conflito de parser) |
| Remocao silenciosa | Logs de auditoria |
| `bridge1` removida por nome fixo | Bridge removida por `comment~"navspot"` |
| 22 comandos individuais | 18 loops agrupados logicamente |

---

## Geracao no TypeScript

Para evitar problemas de escaping, o bloco de cleanup sera gerado como array de linhas:

```typescript
const cleanupLines = [
  '# 0. CLEANUP (safe - foreach + regex ancorado)',
  ':log info "NAVSPOT v' + VERSION + ': Limpando instalacoes anteriores..."',
  '',
  '# 1. Arquivos (regex ancorado ^navspot-)',
  ':foreach f in=[/file find where name~"^navspot-"] do={',
  ':log info ("CLEANUP: removendo arquivo ".[/file get $f name])',
  '/file remove $f',
  '}',
  // ... resto das linhas
];
const cleanupBlock = cleanupLines.join('\n');
```

Isso elimina a necessidade de escape complexo de aspas dentro de template strings.

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `mikrotik-script-generator/index.ts` | Refatorar CLEANUP (linhas 317-341), VERSION 7.1.50 |
| `mikrotik-scripts/index.ts` | VERSION 7.1.50 |
| `mikrotik-sync/index.ts` | VERSION 7.1.50 |
| `mikrotik-recovery-download/index.ts` | VERSION 7.1.50 |

---

## Seguranca Adicional

1. **Bridge protegida**: Agora so remove bridge se `comment~"navspot"` (linha 382 cria bridge com `comment="navspot"`)
2. **Regex ancorado**: `^navspot-` evita match acidental em arquivos como "backup-navspot-old.txt"
3. **Ordem correta**: Scripts/schedulers removidos ANTES de bridges para evitar dependencias quebradas

---

## Validacao

Apos deploy, no MikroTik:
```routeros
/import navspot-bootstrap-v7.1.50.rsc
# Esperado: Sem erros de sintaxe
# Logs: "CLEANUP: removendo arquivo navspot-token.txt"
# Logs: "CLEANUP: removendo script navspot-sync"
# Logs: "NAVSPOT v7.1.50: Cleanup concluido"
```

Dry-run para verificar o que sera removido:
```routeros
:foreach f in=[/file find where name~"^navspot-"] do={ :put [/file get $f name] }
:foreach f in=[/system script find where name~"^navspot-"] do={ :put [/system script get $f name] }
```

