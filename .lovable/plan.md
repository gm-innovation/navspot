

# Plano: Corrigir Portal Captivo - Adicionar Walled Garden Essencial ao Recovery

## Diagnóstico

A página de autenticação do portal não aparece mais porque o **Walled Garden essencial** foi removido/corrompido. O script de **Recovery v6.9.21** atual **NÃO recria** as regras do Walled Garden que permitem acesso ao portal antes da autenticação.

### Fluxo do Problema:
1. Usuário conecta ao WiFi da embarcação
2. MikroTik tenta redirecionar para `navspot.lovable.app/hotspot-login`
3. **Walled Garden não permite** acesso a `navspot.lovable.app` (regra removida)
4. Dispositivo interpreta como "sem internet" e mostra erro

### Logs Confirmam:
- Sync funcionando normalmente (usuário logado aparece)
- Hash de firewall calculado corretamente
- **Nenhuma ação de Walled Garden sendo injetada** (só 3 ações de blacklist)

## Causa Raiz

O Recovery atual (linhas 560-630 de `mikrotik-recovery-download/index.ts`) apenas recria:
- Token
- Action Processor
- Sync Script
- Scheduler
- Netwatch

**NÃO recria:**
- Walled Garden para portal (`navspot.lovable.app`, `*.lovable.app`)
- Walled Garden para backend (`*.supabase.co`, `*.supabase.in`)
- Walled Garden para CDNs (`*.cloudfront.net`, `*.amazonaws.com`)
- Walled Garden para CPD (`*.gstatic.com`, `*.msftconnecttest.com`, `*.apple.com`)
- Protocolos essenciais (DNS, DHCP, NTP, ICMP)

## Solução Proposta

Adicionar **Seção 5: WALLED GARDEN ESSENCIAL** ao script de Recovery que recria todas as regras necessárias para o portal funcionar.

### Mudanças Técnicas

**Arquivo: `supabase/functions/mikrotik-recovery-download/index.ts`**

Adicionar antes da mensagem final de conclusão (antes da linha 622):

```routeros
# 5. WALLED GARDEN ESSENCIAL v6.9.21 (recria se estiver faltando)
# Portal NAVSPOT
:if ([:len [/ip hotspot walled-garden find dst-host="navspot.lovable.app"]] = 0) do={
/ip hotspot walled-garden add dst-host="navspot.lovable.app" action=allow comment="navspot-portal"
:log info "NAVSPOT-RECOVERY: Walled Garden - navspot.lovable.app"
}
:if ([:len [/ip hotspot walled-garden find dst-host="*.lovable.app"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.lovable.app" action=allow comment="navspot-portal"
}
# Backend Supabase
:if ([:len [/ip hotspot walled-garden find dst-host="*.supabase.co"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.supabase.co" action=allow comment="navspot-api"
}
:if ([:len [/ip hotspot walled-garden find dst-host="*.supabase.in"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.supabase.in" action=allow comment="navspot-api"
}
# CDNs para logos
:if ([:len [/ip hotspot walled-garden find dst-host="*.cloudfront.net"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.cloudfront.net" action=allow comment="navspot-cdn"
}
:if ([:len [/ip hotspot walled-garden find dst-host="*.amazonaws.com"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.amazonaws.com" action=allow comment="navspot-cdn"
}
# Captive Portal Detection - Android
:if ([:len [/ip hotspot walled-garden find dst-host="connectivitycheck.gstatic.com"]] = 0) do={
/ip hotspot walled-garden add dst-host="connectivitycheck.gstatic.com" action=allow comment="navspot-cpd-android"
}
:if ([:len [/ip hotspot walled-garden find dst-host="*.gstatic.com"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.gstatic.com" action=allow comment="navspot-cpd-android"
}
# Captive Portal Detection - Windows
:if ([:len [/ip hotspot walled-garden find dst-host="*.msftconnecttest.com"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.msftconnecttest.com" action=allow comment="navspot-cpd-windows"
}
:if ([:len [/ip hotspot walled-garden find dst-host="*.msftncsi.com"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.msftncsi.com" action=allow comment="navspot-cpd-windows"
}
# Captive Portal Detection - Apple
:if ([:len [/ip hotspot walled-garden find dst-host="captive.apple.com"]] = 0) do={
/ip hotspot walled-garden add dst-host="captive.apple.com" action=allow comment="navspot-cpd-apple"
}
:if ([:len [/ip hotspot walled-garden find dst-host="*.apple.com"]] = 0) do={
/ip hotspot walled-garden add dst-host="*.apple.com" action=allow comment="navspot-cpd-apple"
}
# Protocolos essenciais
:if ([:len [/ip hotspot walled-garden ip find dst-port=53 protocol=udp]] = 0) do={
/ip hotspot walled-garden ip add dst-port=53 protocol=udp action=accept comment="navspot-dns"
}
:if ([:len [/ip hotspot walled-garden ip find dst-port=67 protocol=udp]] = 0) do={
/ip hotspot walled-garden ip add dst-port=67-68 protocol=udp action=accept comment="navspot-dhcp"
}
:if ([:len [/ip hotspot walled-garden ip find dst-port=123 protocol=udp]] = 0) do={
/ip hotspot walled-garden ip add dst-port=123 protocol=udp action=accept comment="navspot-ntp"
}
:log info "NAVSPOT-RECOVERY: Walled Garden essencial verificado/restaurado"
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-recovery-download/index.ts` | Adicionar Seção 5 com Walled Garden essencial |

## Resultado Esperado

Após a implementação:
1. O Recovery v6.9.22 recriará automaticamente as regras de Walled Garden faltantes
2. O portal `navspot.lovable.app` ficará acessível antes do login
3. O popup de Captive Portal aparecerá corretamente no Android/iOS/Windows
4. A tela de login do hotspot funcionará normalmente

## Passos Após Implementação

1. Fazer deploy da Edge Function atualizada
2. Baixar novo Recovery no painel
3. Importar no MikroTik: `/import navspot-recovery.rsc`
4. Verificar Walled Garden: `/ip hotspot walled-garden print`
5. Testar conexão com dispositivo Android

