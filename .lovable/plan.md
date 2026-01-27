

# Plano: Ajustes Menores no Script MikroTik (v3.1)

## Melhorias Identificadas

| # | Problema | Impacto | Prioridade |
|---|----------|---------|------------|
| 1 | DHCP Discover muito específico | Pode falhar em alguns cenários | Baixo |
| 2 | Criação de arquivo usa método antigo | Incompatível com firmwares antigos | Baixo |
| 3 | Parsing não valida parâmetros vazios | Pode causar erros silenciosos | Baixo |
| 4 | Falta SSH na porta alternativa | Menor flexibilidade | Opcional |

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Pequenos ajustes nas linhas identificadas |

---

## Correções Detalhadas

### 1. Regra DHCP Simplificada (Linha 491-492)

**Atual:**
```routeros
add chain=input action=accept src-address=0.0.0.0 dst-address=255.255.255.255 \
    dst-port=67 protocol=udp comment="navspot-security-dhcp-discover"
```

**Corrigido:**
```routeros
add chain=input action=accept dst-port=67-68 protocol=udp comment="navspot-security-dhcp"
```

**Motivo:** DHCP vem tanto de `0.0.0.0 → 255.255.255.255` (discover) quanto de IPs da rede (renew/release). A regra simplificada cobre ambos cenários.

---

### 2. Criação de Arquivo Token - Método Garantido (Linhas 512-518)

**Atual:**
```routeros
/file
:do { remove [find name="navspot-token.txt"] } on-error={}
:delay 1s
/file print file="navspot-token" where name=""
:delay 1s
/file set "navspot-token.txt" contents="${hotspot.sync_token}"
```

**Corrigido:**
```routeros
/file
:do { remove [find name="navspot-token.txt"] } on-error={}
:delay 500ms
:do {
  /file add name="navspot-token.txt" contents="${hotspot.sync_token}"
} on-error={
  # Fallback para firmwares mais novos
  /file print file="navspot-token" where name=""
  :delay 1s
  /file set "navspot-token.txt" contents="${hotspot.sync_token}"
}
```

**Motivo:** O comando `/file add name=X contents=Y` é o método direto e suportado em mais versões. O método `print file` + `set` é um workaround que pode falhar em firmwares antigos.

---

### 3. Validação de Parâmetros no Action Processor (Linhas 680-743)

Adicionar verificação para evitar executar ações com parâmetros vazios:

```routeros
# Antes de executar qualquer ação
:if ([:len $actionType] = 0) do={
  :log warning ("NAVSPOT: Action " . $actionId . " has empty type, skipping")
} else={
  # Executar ações...
}
```

E em cada ação que usa parâmetros:

```routeros
:if ($actionType = "update_password") do={
  :if ([:len $param1] > 0 && [:len $param2] > 0) do={
    :do {
      /ip hotspot user set [find name=$param1] password=$param2
      :log info ("NAVSPOT: Updated password for " . $param1)
      :set executed ($executed . "\"" . $actionId . "\",")
    } on-error={}
  } else={
    :log warning ("NAVSPOT: update_password missing params")
  }
}
```

---

### 4. Hotspot HTTP com Porta Alternativa (Linha 495-496) - OPCIONAL

**Atual:**
```routeros
add chain=input action=accept src-address=${networkCidr} \
    dst-port=80,443 protocol=tcp comment="navspot-security-hotspot-http"
```

**Sugestão (opcional):**
```routeros
add chain=input action=accept src-address=${networkCidr} \
    dst-port=80,443,8080 protocol=tcp comment="navspot-security-hotspot-http"
```

**Nota:** Só é necessário se o hotspot usar porta alternativa para captive portal. Por padrão, 80/443 são suficientes.

---

### 5. DNS da WAN - NÃO NECESSÁRIO

A configuração atual já permite DNS na WAN porque:
1. A regra `connection-state=established,related` já aceita respostas DNS
2. O RouterOS faz NAT masquerade por padrão para saída

Adicionar regra explícita de DNS na WAN só seria necessário se o router fosse servidor DNS recursivo para clientes externos (não é o caso do hotspot).

---

## Resumo das Mudanças

| Mudança | Linhas | Benefício |
|---------|--------|-----------|
| DHCP simplificado | 491-492 | Cobre mais cenários |
| Token via `/file add` | 512-518 | Compatível com mais firmwares |
| Validação de parâmetros | 680-743 | Evita erros silenciosos |
| Porta 8080 (opcional) | 495-496 | Flexibilidade extra |

---

## Notas Técnicas

1. **Todas as mudanças são backward-compatible** - Não quebram scripts existentes
2. **Versão do script será incrementada** para 3.1
3. **Logs adicionados** para facilitar debug de parâmetros inválidos

