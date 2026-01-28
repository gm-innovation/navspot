

# Ajustar Tratamento do Valor "auto" na Detecção de Interface

## Problema Identificado

Com a remoção do campo de seleção de interface do formulário, o valor `interface_wifi` agora é sempre `"auto"`. Porém, o código atual gera:

```routeros
:local configuredIf "auto"
:if ([/interface find name=$configuredIf] != "") do={
  # Tenta encontrar uma interface chamada "auto" - que não existe!
}
```

Isso **funciona** porque `"auto"` nunca será encontrada, forçando o fallback automático. Mas é semanticamente incorreto e gera logs confusos:

```
NAVSPOT: Interface configurada 'auto' nao encontrada. Iniciando deteccao automatica...
```

## Solução

Tratar `"auto"` explicitamente como sinal para usar detecção automática, pulando a tentativa de encontrar a interface configurada.

## Arquivo a Modificar

| Arquivo | Linhas |
|---------|--------|
| `supabase/functions/mikrotik-script-generator/index.ts` | 223, 247-267 |

## Alterações

### 1. Tratar "auto" no TypeScript (linha 223)

**Antes:**
```typescript
const interfaceWifi = hotspot.interface_wifi || 'wlan1'
```

**Depois:**
```typescript
// "auto" or empty means auto-detect, don't try to use a specific interface
const interfaceWifi = (hotspot.interface_wifi && hotspot.interface_wifi !== 'auto') 
  ? hotspot.interface_wifi 
  : ''  // Empty string signals auto-detect
```

### 2. Ajustar Lógica RouterOS (linhas 247-267)

**Antes:**
```routeros
:local configuredIf "${interfaceWifi}"
:if ([/interface find name=$configuredIf] != "") do={
  :set targetIf $configuredIf
  :log info ("NAVSPOT: Usando interface configurada: " . $targetIf)
} else={
  :log warning ("NAVSPOT: Interface configurada '" . $configuredIf . "' nao encontrada...")
  # fallback...
}
```

**Depois:**
```routeros
:local configuredIf "${interfaceWifi}"

# Only try configured interface if explicitly set (not empty/auto)
:if ([:len $configuredIf] > 0) do={
  :if ([/interface find name=$configuredIf] != "") do={
    :set targetIf $configuredIf
    :log info ("NAVSPOT: Usando interface configurada: " . $targetIf)
  } else={
    :log warning ("NAVSPOT: Interface '" . $configuredIf . "' nao existe. Detectando automaticamente...")
  }
} else={
  :log info "NAVSPOT: Modo auto-detect ativado"
}

# Auto-detect if no valid interface found yet
:if ($targetIf = "") do={
  :foreach ifName in=$interfacePriority do={
    :if ([/interface find name=$ifName] != "") do={
      :set targetIf $ifName
      :log info ("NAVSPOT: Interface detectada: " . $targetIf)
      :break  # RouterOS não tem break, mas podemos usar a verificação $targetIf = ""
    }
  }
}
```

## Resultado

| Cenário | Antes | Depois |
|---------|-------|--------|
| `interface_wifi = "auto"` | Tenta encontrar "auto", falha, fallback | Vai direto para detecção automática |
| `interface_wifi = ""` | Usa "wlan1" como default | Vai direto para detecção automática |
| `interface_wifi = "bridge1"` | Tenta bridge1, fallback se não existir | Tenta bridge1, fallback se não existir |

## Logs Gerados (Exemplo)

**Modo Auto-detect (padrão):**
```
NAVSPOT: Modo auto-detect ativado
NAVSPOT: Interface detectada: bridge1
NAVSPOT: Interface final selecionada: bridge1
```

**Interface Configurada Encontrada:**
```
NAVSPOT: Usando interface configurada: wlan1
NAVSPOT: Interface final selecionada: wlan1
```

**Interface Configurada Não Existe:**
```
NAVSPOT: Interface 'wlan1' nao existe. Detectando automaticamente...
NAVSPOT: Interface detectada: ether2
NAVSPOT: Interface final selecionada: ether2
```

## Benefícios

1. **Logs claros**: Indica claramente quando está em modo auto-detect
2. **Semântica correta**: "auto" significa auto-detect, não "procurar interface chamada auto"
3. **Backward compatible**: Se alguém configurar uma interface específica, ainda funciona
4. **Menos confusão**: Não mostra "interface 'auto' não encontrada"

