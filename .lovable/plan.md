

# Implementar Detecção Inteligente de Interface no MikroTik Script Generator

## Problema Atual

O script gerado tem uma lógica de fallback muito limitada:

```routeros
:local targetIf "wlan1"
:if ([/interface find name=$targetIf] = "") do={
  :set targetIf "wlan1"
  :if ([/interface find name=$targetIf] = "") do={
    :set targetIf "ether1"  # PROBLEMA: ether1 geralmente é WAN!
  }
}
```

### Problemas identificados:

| Problema | Impacto |
|----------|---------|
| Não tenta bridges | Scripts falham em embarcações com bridge1/bridgeLocal |
| ether1 como fallback final | 90% das vezes ether1 é a porta WAN |
| Não tenta ether2/ether3/ether4 | APs externos geralmente conectam nessas portas |
| Lista fixa de 3 interfaces | Não cobre a diversidade de topologias |

## Solução Proposta

Substituir a lógica de verificação de interface (linhas 238-258) por um loop que testa interfaces em ordem de prioridade baseada em cenários reais de embarcações:

### Lista de Prioridade (ordem de teste)

```text
1. bridge1       - Rede estruturada com bridge
2. bridgeLocal   - Bridge padrão em alguns firmwares
3. wlan1         - Wi-Fi integrado do MikroTik
4. wlan2         - Segundo rádio Wi-Fi
5. ether2        - Primeira porta LAN (ether1 geralmente é WAN)
6. ether3        - Segunda porta LAN
7. ether4        - Terceira porta LAN
8. ether5        - Quarta porta LAN
9. ether1        - Última opção (pode ser WAN)
```

## Arquivo a Modificar

| Arquivo | Linhas |
|---------|--------|
| `supabase/functions/mikrotik-script-generator/index.ts` | 238-258 |

## Código Atual vs Novo

### ANTES (linhas 238-258):
```routeros
:local targetIf "${interfaceWifi}"
:if ([/interface find name=$targetIf] = "") do={
  :log error "NAVSPOT: Interface $targetIf nao encontrada!"
  :log info "NAVSPOT: Tentando wlan1..."
  :set targetIf "wlan1"
  :if ([/interface find name=$targetIf] = "") do={
    :log error "NAVSPOT: Nenhuma interface WiFi encontrada. Tentando ether1..."
    :set targetIf "ether1"
    ...
  }
}
```

### DEPOIS:
```routeros
# Interface Detection with Smart Fallback
:local targetIf ""
:local interfacePriority {"bridge1";"bridgeLocal";"wlan1";"wlan2";"ether2";"ether3";"ether4";"ether5";"ether1"}

# First, try the configured interface
:local configuredIf "${interfaceWifi}"
:if ([/interface find name=$configuredIf] != "") do={
  :set targetIf $configuredIf
  :log info ("NAVSPOT: Usando interface configurada: " . $targetIf)
} else={
  :log warning ("NAVSPOT: Interface configurada '" . $configuredIf . "' nao encontrada. Iniciando deteccao automatica...")
  
  # Auto-detect best available interface
  :foreach ifName in=$interfacePriority do={
    :if ($targetIf = "") do={
      :if ([/interface find name=$ifName] != "") do={
        :set targetIf $ifName
        :log info ("NAVSPOT: Interface detectada automaticamente: " . $targetIf)
      }
    }
  }
}

# Final validation
:if ($targetIf = "") do={
  :log error "NAVSPOT: ERRO CRITICO - Nenhuma interface valida encontrada!"
  :log error "NAVSPOT: Interfaces testadas: bridge1, bridgeLocal, wlan1, wlan2, ether2-5, ether1"
  :error "Abortando - nenhuma interface disponivel"
}

:log info ("NAVSPOT: Interface final selecionada: " . $targetIf)
```

## Lógica de Detecção

```text
+---------------------------+
| Interface configurada     |
| (hotspot.interface_wifi)  |
+---------------------------+
           |
           v
     Existe no MikroTik?
           |
    +------+------+
    |             |
   SIM           NÃO
    |             |
    v             v
  Usar        Loop de detecção:
  essa        +-> bridge1 existe? -> usar
              +-> bridgeLocal existe? -> usar
              +-> wlan1 existe? -> usar
              +-> wlan2 existe? -> usar
              +-> ether2 existe? -> usar
              +-> ether3 existe? -> usar
              +-> ether4 existe? -> usar
              +-> ether5 existe? -> usar
              +-> ether1 existe? -> usar (último recurso)
              |
              v
         Nenhuma? -> ERRO e abortar
```

## Cenários Cobertos

| Cenário | Interface Detectada | Funciona? |
|---------|---------------------|-----------|
| Rede estruturada com bridge | bridge1 | Sim |
| MikroTik com Wi-Fi integrado | wlan1 | Sim |
| AP externo na ether2 | ether2 | Sim |
| AP externo na ether4 | ether4 | Sim |
| Configuração legada | bridgeLocal | Sim |
| Dual-band Wi-Fi | wlan1 ou wlan2 | Sim |
| Apenas ether1 disponível | ether1 (alerta) | Sim |

## Benefícios

1. **Universalidade**: O mesmo script funciona em qualquer topologia de rede
2. **Zero manutenção**: Não precisa personalizar interface por embarcação
3. **Resiliência**: Se a interface configurada não existir, detecta automaticamente
4. **Logs claros**: Mostra qual interface foi detectada e por quê
5. **Segurança**: ether1 é último recurso (geralmente é WAN)

## Considerações Técnicas

- O loop RouterOS usa `:foreach` com array de strings
- O `:break` implícito é feito verificando `$targetIf = ""`
- A interface configurada no banco (`hotspot.interface_wifi`) tem prioridade máxima
- Se a interface configurada existir, usa ela (não faz detecção)
- Se não existir, detecta automaticamente com logs de warning

