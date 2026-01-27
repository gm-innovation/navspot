
# Plano: Melhorias de Robustez no Script MikroTik

## Problemas Identificados

| # | Problema | Impacto | Prioridade |
|---|----------|---------|------------|
| 1 | Interface não verificada | Hotspot falha silenciosamente | Crítico |
| 2 | IP/DHCP não configurado | Clientes não recebem IP | Crítico |
| 3 | Parsing JSON limitado | Ações não executam | Alto |
| 4 | Script de ações incompleto | Comandos remotos não funcionam | Alto |
| 5 | Token hardcoded visível | Risco de segurança moderado | Médio |
| 6 | Walled Garden incompleto | DHCP/NTP podem falhar | Médio |

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Reescrever função `generateMikroTikScript` |

---

## Correções Detalhadas

### 1. Verificação de Interface + Fallback

```routeros
# Verificar se interface existe
:local targetIf "${interface_wifi}"
:if ([/interface find name=$targetIf] = "") do={
  :log error "NAVSPOT: Interface $targetIf nao encontrada!"
  :log info "NAVSPOT: Tentando wlan1..."
  :set targetIf "wlan1"
  :if ([/interface find name=$targetIf] = "") do={
    :log error "NAVSPOT: Nenhuma interface WiFi encontrada. Abortando."
    :error "Interface nao encontrada"
  }
}
```

### 2. Configuração Completa de IP + DHCP

```routeros
# IP Address na interface
/ip address
:do { remove [find interface=$targetIf comment~"navspot"] } on-error={}
add address=${gateway}/24 interface=$targetIf comment="navspot-${slug}"

# DHCP Server Network
/ip dhcp-server network
:do { remove [find comment~"navspot-${slug}"] } on-error={}
add address=${network}/24 gateway=${gateway} dns-server=${gateway} comment="navspot-${slug}"

# DHCP Server
/ip dhcp-server
:do { remove [find name="dhcp-${slug}"] } on-error={}
add name="dhcp-${slug}" interface=$targetIf address-pool=hs-pool-${slug} disabled=no
```

### 3. Action Processor Funcional

O RouterOS tem capacidades limitadas de parsing JSON, mas podemos usar um formato simplificado (key=value) que o script consegue processar:

```routeros
# O servidor envia ações no formato:
# action_id|action_type|param1|param2
# Exemplo: abc123|kick_session|joao|00:11:22:33:44:55

add name="navspot-action-processor" source={
  :local actionFile "navspot-actions.txt"
  :do {
    :local content [/file get $actionFile contents]
    :local lines [:toarray $content]
    
    :foreach line in=$lines do={
      :local parts [:toarray $line separator="|"]
      :local actionId [:pick $parts 0]
      :local actionType [:pick $parts 1]
      
      :if ($actionType = "kick_session") do={
        :local user [:pick $parts 2]
        :local mac [:pick $parts 3]
        :do {
          /ip hotspot active remove [find user=$user mac-address=$mac]
          :log info "NAVSPOT: Kicked session $user"
          # Registrar ação executada
          /file print file="navspot-executed" where name="navspot-executed.txt" as-value
          :delay 100ms
          /file set "navspot-executed.txt" contents=([/file get "navspot-executed.txt" contents] . $actionId . ",")
        } on-error={}
      }
      
      :if ($actionType = "disable_user") do={
        :local user [:pick $parts 2]
        /ip hotspot user set [find name=$user] disabled=yes
        :log info "NAVSPOT: Disabled user $user"
      }
      
      :if ($actionType = "enable_user") do={
        :local user [:pick $parts 2]
        /ip hotspot user set [find name=$user] disabled=no
        :log info "NAVSPOT: Enabled user $user"
      }
      
      :if ($actionType = "update_password") do={
        :local user [:pick $parts 2]
        :local newPass [:pick $parts 3]
        /ip hotspot user set [find name=$user] password=$newPass
        :log info "NAVSPOT: Updated password for $user"
      }
      
      :if ($actionType = "add_user") do={
        :local user [:pick $parts 2]
        :local pass [:pick $parts 3]
        :local profile [:pick $parts 4]
        /ip hotspot user add name=$user password=$pass profile=$profile server=hs-${slug}
        :log info "NAVSPOT: Added user $user"
      }
      
      :if ($actionType = "remove_user") do={
        :local user [:pick $parts 2]
        /ip hotspot user remove [find name=$user]
        :log info "NAVSPOT: Removed user $user"
      }
    }
    
    /file remove $actionFile
  } on-error={
    :log debug "NAVSPOT: No pending actions"
  }
}
```

### 4. Walled Garden Completo

```routeros
/ip hotspot walled-garden ip
:do { remove [find comment~"navspot-${slug}"] } on-error={}
# DNS
add dst-address=0.0.0.0/0 dst-port=53 protocol=udp action=accept comment="navspot-${slug}-dns"
add dst-address=0.0.0.0/0 dst-port=53 protocol=tcp action=accept comment="navspot-${slug}-dns-tcp"
# DHCP
add dst-address=0.0.0.0/0 dst-port=67-68 protocol=udp action=accept comment="navspot-${slug}-dhcp"
# NTP (sincronização de hora)
add dst-address=0.0.0.0/0 dst-port=123 protocol=udp action=accept comment="navspot-${slug}-ntp"
# ICMP (ping para diagnóstico)
add protocol=icmp action=accept comment="navspot-${slug}-icmp"
```

### 5. Token em Arquivo Separado (Melhoria de Segurança)

Em vez de hardcoded no script, salvar em arquivo oculto:

```routeros
# Salvar token em arquivo (mais seguro que inline)
/file
:do { remove [find name="navspot-token.txt"] } on-error={}
# O token será escrito pelo setup inicial
/file print file="navspot-token" where name=""
:delay 500ms
/file set "navspot-token.txt" contents="${sync_token}"

# No script de sync:
:local syncToken [/file get "navspot-token.txt" contents]
```

### 6. Verificações de Saúde do Sistema

```routeros
# Health check script
add name="navspot-health" source={
  :local interface "${interface_wifi}"
  :local hotspotName "hs-${slug}"
  
  # Verificar se hotspot está ativo
  :if ([/ip hotspot find name=$hotspotName disabled=no] = "") do={
    :log warning "NAVSPOT: Hotspot não está ativo, reativando..."
    /ip hotspot enable $hotspotName
  }
  
  # Verificar se DHCP está ativo
  :if ([/ip dhcp-server find name="dhcp-${slug}" disabled=no] = "") do={
    :log warning "NAVSPOT: DHCP não está ativo, reativando..."
    /ip dhcp-server enable "dhcp-${slug}"
  }
  
  :log info "NAVSPOT: Health check OK"
}

# Scheduler para health check a cada hora
add name="navspot-health-scheduler" interval=1h on-event="/system script run navspot-health"
```

---

## Estrutura Final do Script

```text
1. Header + Identificação
2. Verificação de Interface (com fallback)
3. Configuração de IP na Interface
4. Pool de IPs
5. DHCP Server + Network
6. Hotspot Profile
7. User Profiles (velocidade/quota/dispositivos)
8. Hotspot Server
9. Users (tripulantes)
10. Walled Garden (domínios)
11. Walled Garden IP (DNS/DHCP/NTP/ICMP)
12. Firewall Rules (bloqueios)
13. Token em arquivo separado
14. Sync Script (melhorado)
15. Action Processor (funcional)
16. Health Check Script
17. Schedulers
18. Sync inicial
```

---

## Edge Function: mikrotik-sync Adaptação

A edge function de sync também precisa ser adaptada para enviar ações no formato simplificado:

```typescript
// Formato de resposta para o MikroTik
{
  "pending_actions": "abc123|kick_session|joao|00:11:22:33:44:55\ndef456|disable_user|maria"
}
```

---

## Fluxo de Comunicação

```text
+-------------+          +---------------+          +-------------+
|  MikroTik   |  POST    |  Edge Func    |          |  Database   |
|  Router     |--------->|  mikrotik-    |<-------->|  Supabase   |
|             |          |  sync         |          |             |
+-------------+          +---------------+          +-------------+
      |                        |
      | 1. Envia sessões ativas|
      | 2. Envia ações exec.   |
      |----------------------->|
      |                        | 3. Salva consumo
      |                        | 4. Busca ações pendentes
      |                        | 5. Formata em pipe-delimited
      |<-----------------------|
      | 6. Recebe ações        |
      | 7. Salva em arquivo    |
      | 8. Processa ações      |
      | 9. Registra execução   |
```

---

## Resumo das Mudanças

| Mudança | Benefício |
|---------|-----------|
| Verificação de interface | Evita falha silenciosa |
| Configuração IP/DHCP | Clientes funcionam corretamente |
| Action processor real | Comandos remotos funcionam |
| Walled garden completo | DHCP/NTP/ping funcionam |
| Token em arquivo | Menos exposição visual |
| Health check | Auto-recuperação de falhas |
| Formato pipe-delimited | Compatível com parsing RouterOS |
