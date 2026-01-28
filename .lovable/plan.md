

# Correção de Espaços em Branco - RouterOS v6 (v3.12)

## Problema Identificado

O script v3.11 contém espaços em branco no início de várias linhas de comando. O RouterOS v6 não tolera espaços antes de comandos fora de blocos `do={}`.

### Linhas com Espaços Problemáticos

| Linha | Código Atual | Problema |
|-------|--------------|----------|
| 262 | ` :delay 3s` | Espaço antes de `:delay` |
| 305 | ` :delay 3s` | Espaço antes de `:delay` |
| 307 | ` # Step 9:...` | Espaço antes de `#` |
| 308 | ` :local __waitBridge 0` | Espaço antes de `:local` |
| 309 | ` :while ...` | Espaço antes de `:while` |
| 310 | `     :delay 1s` | Espaços extras |
| 311 | `     :set __waitBridge...` | Espaços extras |
| 312 | ` }` | Espaço antes de `}` |
| 324 | ` :local interfacePriority` | Espaço antes de `:local` |

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Remover espaços iniciais das linhas |

---

## Correções Detalhadas

### Versão do Script

```typescript
# Version: 3.12 - Whitespace Fix
```

### Linha 262 - Delay após bridge

**Antes:**
```routeros
 :delay 3s
```

**Depois:**
```routeros
:delay 3s
```

### Linha 305 - Delay após ports

**Antes:**
```routeros
 :delay 3s
```

**Depois:**
```routeros
:delay 3s
```

### Linhas 307-312 - Loop de espera da bridge

**Antes:**
```routeros
 # Step 9: RouterOS v6 pode demorar a expor a bridge em /interface
 :local __waitBridge 0
 :while (($__waitBridge < 5) && ([/interface find name="bridge1"] = "")) do={
     :delay 1s
     :set __waitBridge ($__waitBridge + 1)
 }
```

**Depois:**
```routeros
# Step 9: RouterOS v6 pode demorar a expor a bridge em /interface
:local __waitBridge 0
:while (($__waitBridge < 5) && ([/interface find name="bridge1"] = "")) do={
    :delay 1s
    :set __waitBridge ($__waitBridge + 1)
}
```

### Linha 324 - Interface Priority

**Antes:**
```routeros
 :local interfacePriority {"bridge1";"wlan1";"wlan2";"ether2";"ether3";"ether4";"ether5"}
```

**Depois:**
```routeros
:local interfacePriority {"bridge1";"wlan1";"wlan2";"ether2";"ether3";"ether4";"ether5"}
```

---

## Regra de Ouro Adicional (v3.12)

> **Regra #6**: O gerador NUNCA deve adicionar espaços ou tabs no início de linhas de código RouterOS. Todas as linhas devem começar na coluna 1 (exceto indentação normal dentro de blocos `do={}`).

---

## Seção Técnica

### Localizações das Correções no TypeScript

As correções são simples - remover o espaço inicial que foi acidentalmente adicionado nas seguintes linhas do arquivo `index.ts`:

| Linha TS | Texto Atual | Correção |
|----------|-------------|----------|
| ~262 | `" :delay 3s"` | `":delay 3s"` |
| ~305 | `" :delay 3s"` | `":delay 3s"` |
| ~307 | `" # Step 9..."` | `"# Step 9..."` |
| ~308 | `" :local __waitBridge"` | `":local __waitBridge"` |
| ~309 | `" :while..."` | `":while..."` |
| ~310 | `"     :delay"` | `"    :delay"` |
| ~311 | `"     :set"` | `"    :set"` |
| ~312 | `" }"` | `"}"` |
| ~324 | `" :local interfacePriority"` | `":local interfacePriority"` |

---

## Compatibilidade

| RouterOS | v3.11 | v3.12 |
|----------|-------|-------|
| v6.x | ERRO de parsing (linha 82) | OK |
| v7.x | Funciona | OK |

---

## Comportamento Após Correção

| Antes (v3.11) | Depois (v3.12) |
|---------------|----------------|
| `expected end of command (line 82)` | Script executa completamente |
| Espaços no início causam parsing failure | Todas as linhas começam na coluna 1 |
| Interface não detectada | Interface detectada corretamente |

