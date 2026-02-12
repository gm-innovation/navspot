

# v7.7.1: Atualizar Templates com Modelos Corrigidos do Usuario

## Situacao Atual no Banco

Os templates ja existem e estao funcionais:

| Template | Tamanho | Status |
|----------|---------|--------|
| `bootstrap` | 12.7KB | Template ULTRA-THIN com fetch/import (funcional) |
| `sync` | 3.1KB | 6 handlers completos (configure_hotspot_profile, create_user, create_profile, remove_user, disable_user, enable_user) |
| `guardian` | 1.9KB | Recovery automatico via fetch de recovery.rsc |
| `sync-standalone` | 1.4KB | Wrapper que injeta `{{SYNC_SOURCE}}` via Edge Function |
| `guardian-standalone` | 946B | Wrapper que injeta `{{GUARDIAN_SOURCE}}` via Edge Function |
| `installer` | 6.1KB | Instalador completo (fetch + import sync + guardian) |

## Comparacao: Modelos do Usuario vs Templates do Banco

### 1. infra.rsc (usuario) vs bootstrap (banco)

O modelo `infra.rsc` do usuario e uma versao simplificada e limpa da infraestrutura. O `bootstrap` atual (12.7KB) e um script ULTRA-THIN que faz fetch/import dos scripts sync e guardian automaticamente.

**Decisao recomendada:** Criar um **novo template `infra`** no banco, baseado no modelo do usuario, para uso na aba Modular. O `bootstrap` continua existindo para o fluxo automatico. Sao complementares, nao substitutos.

Ajustes necessarios no modelo do usuario para virar template:
- Substituir token hardcoded por `{{SYNC_TOKEN}}`
- Substituir IPs hardcoded por placeholders (`{{GATEWAY}}`, `{{NETWORK_CIDR}}`, `{{POOL_START}}`, `{{POOL_END}}`)
- Adicionar `{{VERSION}}` nos logs
- Adicionar `{{SUPABASE_HOST}}` no walled garden

### 2. sync-standalone.rsc (usuario) vs sync-standalone (banco)

O template `sync-standalone` do banco ja funciona corretamente: ele usa `{{SYNC_SOURCE}}` como placeholder, e a Edge Function injeta o conteudo escapado do template `sync` (que tem os 6 handlers completos).

O modelo do usuario tem apenas 3 handlers (remove_user, disable_user, enable_user) - faltam `configure_hotspot_profile`, `create_user` e `create_profile`.

**Decisao:** Manter o template `sync-standalone` do banco como esta. Ele ja e mais completo e correto. Nenhuma mudanca necessaria.

### 3. guardian-standalone.rsc (usuario) vs guardian-standalone (banco)

O template `guardian-standalone` do banco ja funciona: usa `{{GUARDIAN_SOURCE}}` e a Edge Function injeta o conteudo do template `guardian` (que inclui recovery automatico via fetch).

O modelo do usuario e mais simples (sem recovery), o que e uma escolha valida mas reduz a capacidade de auto-reparo.

**Decisao:** Manter o template `guardian-standalone` do banco como esta. Ele ja tem recovery integrado.

## Plano de Implementacao

### Unica mudanca necessaria: Criar template `infra` no banco

Inserir um novo registro na tabela `script_templates` com id=`infra`, baseado no modelo do usuario, parametrizado com placeholders.

O conteudo sera:
- Cleanup idempotente de instalacoes anteriores
- Bridge + IP com guardrail de conflito
- Pool DHCP + servidor DHCP
- NAT masquerade
- Hotspot profile (cookie 30m, login-by cookie+http-pap)
- Hotspot server
- Walled garden (gstatic, supabase, jsdelivr, fonts)
- Salvar token em arquivo

### Atualizar Edge Function

Adicionar `type=infra` como tipo proprio (nao alias de bootstrap):
- Buscar template `infra` do banco
- Aplicar placeholders de rede derivados do hotspot
- Retornar como text/plain

### Nenhuma mudanca no frontend

A aba Modular ja chama `type=infra` - so precisa do template no banco e do handler no serve mode.

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| SQL (via insert tool) | INSERT template `infra` na tabela `script_templates` |
| `mikrotik-script-generator/index.ts` | Separar `infra` de `bootstrap` no serve mode |

## Resumo

- Os templates `sync-standalone` e `guardian-standalone` do banco ja estao **mais completos** que os modelos do usuario (6 handlers vs 3, recovery automatico vs sem recovery)
- O modelo `infra.rsc` do usuario e **util e complementar** ao bootstrap - sera adicionado como template novo
- Nenhum template existente precisa ser substituido

