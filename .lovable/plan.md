
# Plano: Diagnóstico e Resolução dos Problemas do Hotspot

## Diagnóstico Completo

Após análise detalhada do código, logs e fluxo do sistema, identifiquei as causas raiz de cada problema:

---

## Problema 1: Tela de Autenticação do Hotspot Não Aparece

### Causa Raiz
O script de Recovery v6.9.21 **não foi importado corretamente** (houve erro de sintaxe na linha 20). O MikroTik continua rodando a versão antiga que pode ter:
- Walled Garden incompleto
- login-url incorreta
- Hotspot Profile não configurado

### Verificação Necessária
```routeros
/ip hotspot profile print
/ip hotspot print
/log print where message~"NAVSPOT"
```

### Solução
1. Corrigir o script de Recovery v6.9.21 (já corrigido no último deploy)
2. Baixar novo Recovery e importar no MikroTik
3. Verificar que o hotspot profile tem `login-url` apontando para `navspot.lovable.app`

---

## Problema 2: Formulário de Cadastro Não Abre

### Causa Raiz
O redirecionamento para `/completar-cadastro` depende de:
1. **login-url** estar configurada corretamente no hotspot profile
2. **Status do tripulante** ser `pendente_cadastro`
3. **Walled Garden** permitir acesso ao `navspot.lovable.app`

### Verificação
A login-url está configurada como:
```routeros
login-url="https://navspot.lovable.app/hotspot-login?h=${hotspot.id}&mac=\\$(mac)&ip=\\$(ip)&link-login-only=\\$(link-login-only)"
```

O fluxo é:
1. Usuário conecta na WiFi
2. MikroTik redireciona para `navspot.lovable.app/hotspot-login`
3. Usuário faz login com credenciais
4. Se status = `pendente_cadastro`, redireciona para `/completar-cadastro`
5. Após completar, faz auto-login e libera acesso

### Solução
Reimportar o script v6.9.21 que configura o hotspot profile corretamente.

---

## Problema 3: Whitelists Não Funcionam (Apenas Templates)

### Causa Raiz Principal
Os logs mostram claramente:
```
v6.9.17: Firewall rules unchanged, skipping injection (loop prevention)
```

O sistema coleta corretamente **17 domínios** da whitelist, mas **não injeta os comandos** porque:
1. O hash das regras não mudou desde a última vez
2. Os comandos foram enviados anteriormente, mas o MikroTik não os processou corretamente (script v6.9.20)
3. O action processor v6.9.20 **não tinha** a lógica de Walled Garden + ordem correta

### Solução em 3 Etapas

#### Etapa 1: Forçar Re-injeção das Regras
Limpar o hash para forçar o backend a reenviar todos os comandos de whitelist:

```sql
UPDATE hotspots SET firewall_rules_hash = NULL 
WHERE id = '27a1e1be-4ba7-4496-adb1-9227d3a80ad1';
```

#### Etapa 2: Atualizar o Script no MikroTik
Importar o Recovery v6.9.21 que tem:
- Action processor com ordem correta (ACCEPT antes de DROP)
- Lógica de Walled Garden para whitelists
- timeout=none nos address-list

#### Etapa 3: Verificar Resultado
```routeros
# Verificar Walled Garden
/ip hotspot walled-garden print where comment~"navspot-allow"

# Verificar Address-List
/ip firewall address-list print where list=NAVSPOT-ALLOWED

# Verificar ordem do Firewall
/ip firewall filter print where comment~"NAVSPOT-ALLOW"
```

---

## Problema 4: Sugestão de Mudança de Abordagem

### Análise da Sugestão
A abordagem "liberar tudo + blacklist" é mais simples, mas o sistema **já suporta ambos os modos**:

| Modo | Configuração | Comportamento |
|------|--------------|---------------|
| `liberar_tudo` | modo_acesso=liberar_tudo + blacklist | Tudo liberado, apenas blacklist bloqueada |
| `bloquear_tudo` | modo_acesso=bloquear_tudo + whitelist | Tudo bloqueado, apenas whitelist liberada |

### Problema Atual
O perfil "Tripulação Googlemarine" está em modo `bloquear_tudo`, que requer whitelist funcional.

### Opções

**Opção A: Manter modo atual e corrigir whitelist**
- Implementar as correções acima
- Resultado: Sistema funciona como projetado

**Opção B: Mudar para modo permissivo**
- Alterar perfil para `liberar_tudo`
- Criar blacklists robustas (streaming, redes sociais, etc)
- Mais simples de manter, menos falsos positivos

---

## Plano de Implementação

### 1. Limpar Hash para Forçar Re-injeção
Executar no banco de dados:
```sql
UPDATE hotspots SET firewall_rules_hash = NULL;
```

Isso fará o próximo sync enviar todos os comandos `add_firewall_allow` novamente.

### 2. Corrigir Erro de Sintaxe no Recovery (se ainda existir)
Verificar se há algum problema remanescente no arquivo gerado.

### 3. Melhorar Logging no Action Processor
Adicionar logs mais detalhados para debug quando comandos são processados.

### 4. Considerar Opção de "Limpar e Reaplicar" no Painel
Criar um botão no painel que:
- Limpa o hash
- Limpa regras NAVSPOT no MikroTik (via action)
- Força re-sincronização completa

---

## Mudanças de Código Necessárias

### Arquivo 1: Limpar Hash via SQL
```sql
-- Forçar re-injeção de regras de firewall
UPDATE hotspots 
SET firewall_rules_hash = NULL, firewall_rules_updated_at = NULL;
```

### Arquivo 2: Adicionar Logging Detalhado (Opcional)
Em `mikrotik-sync/index.ts`, melhorar logs quando hash muda:

```typescript
if (currentHash !== newHash) {
  console.log(`[mikrotik-sync] v6.9.21: Firewall rules changed!`)
  console.log(`[mikrotik-sync] v6.9.21: Old hash: ${currentHash || 'none'}`)
  console.log(`[mikrotik-sync] v6.9.21: New hash: ${newHash}`)
  console.log(`[mikrotik-sync] v6.9.21: Domains to inject: ${allDomains.join(', ')}`)
  // ... inject actions
}
```

---

## Resumo das Ações

| # | Ação | Responsável |
|---|------|-------------|
| 1 | Limpar `firewall_rules_hash` no banco | Sistema |
| 2 | Baixar novo Recovery v6.9.21 | Usuário |
| 3 | Importar Recovery no MikroTik | Usuário |
| 4 | Aguardar próximo sync (1 minuto) | Automático |
| 5 | Verificar logs e regras aplicadas | Usuário |

---

## Testes de Validação

### No MikroTik:
```routeros
# 1. Verificar versão
/log print where message~"v6.9.21"

# 2. Verificar Hotspot Profile
/ip hotspot profile print where name~"navspot"

# 3. Verificar Walled Garden
/ip hotspot walled-garden print where comment~"navspot-allow"

# 4. Verificar Address-List
/ip firewall address-list print where list=NAVSPOT-ALLOWED

# 5. Verificar ordem do Firewall
/ip firewall filter print where comment~"NAVSPOT-ALLOW"

# 6. Testar acesso
/tool fetch url="https://uol.com.br" output=none
```

### No Painel:
1. Verificar que o consumo foi resetado
2. Verificar logs de sincronização

---

## Arquivos a Modificar

Apenas limpeza de dados no banco (não requer código novo).

A implementação anterior da v6.9.21 já contém todas as correções necessárias no código. O problema é que:
1. O hash impede re-injeção das regras
2. O MikroTik não recebeu o script atualizado

