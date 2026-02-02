# NAVSPOT v6.9.12 - Plano de Instalador Resiliente

**Status: ✅ IMPLEMENTADO**

## Objetivo

Tornar a instalação/atualização do MikroTik resiliente a:
- reboot inesperado / queda de energia durante instalação
- truncamento/instabilidade em operações longas
- perda pontual do script `navspot-sync` (ou scheduler apontando para script ausente), que leva o hotspot a ficar "Offline" no painel por parar de atualizar `ultima_sincronizacao`

A meta é que o roteador "se cure sozinho" quando detectar que o `navspot-sync` sumiu, sem exigir intervenção manual e sem arriscar apagar um script funcional durante updates.

---

## Mudanças Implementadas (v6.9.12)

### ✅ A) "Safe update" - Padrão set-or-add
- **Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`
- Trocou o padrão remove→add por **set-or-add**:
  - Se o script existe → `/system script set ... source={...} policy=...`
  - Se não existe → `/system script add ...`
- Na limpeza inicial, **não remove mais scripts/schedulers** - apenas rede/bridge/hotspot

### ✅ B) Auto-recuperação (navspot-guardian)
- **Arquivo**: `supabase/functions/mikrotik-script-generator/index.ts`
- Script `navspot-guardian` criado PRIMEIRO no bootstrap
- Scheduler `navspot-guardian-scheduler` roda a cada 10 minutos + startup
- Verifica se existem:
  - `/system script find name="navspot-sync"`
  - `/system script find name="navspot-action-processor"`
  - `/system scheduler find name="navspot-sync-scheduler"`
- Se faltando, baixa recovery via `/tool fetch` e executa `/import`

### ✅ C) Endpoint mikrotik-recovery-download
- **Arquivo**: `supabase/functions/mikrotik-recovery-download/index.ts`
- Endpoint público (`verify_jwt = false`)
- Aceita POST com `{ "sync_token": "..." }` e GET com `?sync_token=...`
- Retorna `.rsc` **minimalista** que:
  - Usa set-or-add para scripts/schedulers
  - NÃO mexe em bridge/DHCP/NAT/hotspot
- Headers: `text/plain`, `no-store`

### ✅ D) Healthcheck no mikrotik-sync
- **Arquivo**: `supabase/functions/mikrotik-sync/index.ts`
- GET → retorna 200 `{"status":"ok","timestamp":"...","version":"6.9.12"}`
- POST sem body/JSON inválido → retorna 400 (não 500)

### ✅ E) UX do ScriptModal
- **Arquivo**: `src/components/modals/ScriptModal.tsx`
- Botão "Download Script" agora é principal e destacado
- "Copiar Script" movido para seção colapsível "Opções Avançadas"
- Aviso sobre truncamento no terminal
- Seção sobre auto-recuperação v6.9.12

---

## Testes de Aceitação

### 1) Instalação normal:
```
# Gerar script no painel, baixar .rsc, importar
/import navspot-bootstrap.rsc

# Confirmar scripts
/system script print where name~"navspot"
# Deve listar: navspot-sync, navspot-action-processor, navspot-guardian

# Confirmar schedulers
/system scheduler print where name~"navspot"
# Deve listar: navspot-sync-scheduler, navspot-guardian-scheduler

# Painel: ultima_sincronizacao atualizando e status "Online"
```

### 2) Simular falha e testar auto-reparo:
```
# Remover manualmente apenas navspot-sync
/system script remove [find name="navspot-sync"]

# Aguardar até 10 minutos (ou executar guardian manualmente)
/system script run navspot-guardian

# Verificar logs
/log print where message~"NAVSPOT-GUARDIAN"
# Deve mostrar: "Componentes faltando: navspot-sync" e "Reparo concluido"

# Confirmar que navspot-sync voltou
/system script print where name="navspot-sync"
```

### 3) Teste de diagnóstico (healthcheck):
```
# Via browser ou curl
GET https://focqrhkozhdefohroqyi.supabase.co/functions/v1/mikrotik-sync
# Deve retornar 200 {"status":"ok",...}
```

---

## Arquivos Modificados

### Backend:
- `supabase/functions/mikrotik-script-generator/index.ts` - Safe update + Guardian
- `supabase/functions/mikrotik-sync/index.ts` - Healthcheck GET + 400 em JSON inválido
- `supabase/functions/mikrotik-recovery-download/index.ts` - **NOVO** - Recovery endpoint
- `supabase/config.toml` - Registrado nova função

### Frontend:
- `src/components/modals/ScriptModal.tsx` - UX melhorada
