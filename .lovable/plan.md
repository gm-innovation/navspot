
# Plano v6.9.19: Resiliência Total para Reboot/Queda de Energia

## Problema Identificado

O RouterOS 6.x tem problemas conhecidos com `start-time=startup`:
1. O scheduler pode não disparar se o relógio não estiver sincronizado
2. Se a rede ainda não subiu, o fetch do sync falha silenciosamente
3. Não há mecanismo de "watchdog" que garanta a re-criação dos componentes

## Solução: Startup Script no /system/script/startup

O RouterOS 6.x e 7.x têm um mecanismo mais robusto: scripts executados via `/system/script/run` chamado por um scheduler com `start-date` fixo + verificação no `/system/reset-counter`.

A solução mais confiável é usar **múltiplas camadas de proteção**:

### Camada 1: Scheduler com on-event inline robusto

Em vez de:
```
on-event="/system script run navspot-sync"
```

Usar:
```
on-event=":delay 30s; /system script run navspot-sync"
```

Isso dá tempo para a rede subir antes de tentar o sync.

### Camada 2: Guardian com startup verificação dupla

O guardian-scheduler precisa ter `start-time=startup` E `interval=10m`, mas com um **delay inicial** para aguardar a rede.

### Camada 3: Netwatch para trigger automático

Usar `/tool netwatch` para detectar quando a internet volta e rodar o sync automaticamente.

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Adicionar delay no startup + netwatch |
| `supabase/functions/mikrotik-recovery-download/index.ts` | Mesmo padrão no recovery |

## Mudanças Técnicas Detalhadas

### 1. Script Generator - Scheduler com delay (linhas 793-798)

```typescript
// ANTES
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m 
  on-event="/system script run navspot-sync" start-time=startup

// DEPOIS  
/system scheduler add name="navspot-sync-scheduler" interval=${syncIntervalMinutes}m 
  on-event=":delay 30s; :do { /system script run navspot-sync } on-error={}"
  start-time=startup start-date=jan/01/1970
```

A adição de `start-date=jan/01/1970` força execução no boot mesmo com relógio dessincronizado.

### 2. Script Generator - Guardian scheduler com delay (linhas 755-759)

```typescript
// ANTES
/system scheduler add name="navspot-guardian-scheduler" interval=10m 
  on-event="/system script run navspot-guardian" start-time=startup

// DEPOIS
/system scheduler add name="navspot-guardian-scheduler" interval=10m 
  on-event=":delay 20s; :do { /system script run navspot-guardian } on-error={}"
  start-time=startup start-date=jan/01/1970
```

### 3. Adicionar Netwatch como camada extra de proteção

Após a criação dos schedulers, adicionar:

```routeros
# Netwatch - dispara sync quando internet volta
:if ([:len [/tool netwatch find comment="navspot-netwatch"]] = 0) do={
/tool netwatch add host=8.8.8.8 interval=30s down-script="" \
  up-script=":delay 5s; /system script run navspot-sync" \
  comment="navspot-netwatch"
:log info "NAVSPOT: Netwatch configurado para auto-sync"
}
```

### 4. Recovery Download - Mesmo padrão

Atualizar o recovery para usar o mesmo padrão de schedulers com delay.

### 5. Versão marcador: v6.9.19

Atualizar todos os logs e comentários para v6.9.19.

## Fluxo de Proteção Após as Mudanças

```text
REBOOT DO MIKROTIK
       │
       ▼
[0s] RouterOS inicia
       │
       ├──► navspot-guardian-scheduler (startup)
       │           │
       │           ▼
       │    [+20s] Guardian verifica integridade
       │           │
       │           ├── OK → Log "Sistema integro"
       │           │
       │           └── Faltando → Baixa recovery + repara
       │
       └──► navspot-sync-scheduler (startup)
                   │
                   ▼
            [+30s] Sync executa (rede já subiu)
                   │
                   ▼
            [OK] Hotspot online

PERDA DE INTERNET
       │
       ▼
[0s] netwatch detecta 8.8.8.8 down
       │
       ▼
[...] Aguarda reconexão
       │
       ▼
[Xmin] 8.8.8.8 responde
       │
       ▼
[+5s] up-script executa navspot-sync
       │
       ▼
[OK] Hotspot sincroniza imediatamente
```

## Ordem de Execução

1. Editar `mikrotik-script-generator/index.ts`:
   - Scheduler sync com delay 30s
   - Scheduler guardian com delay 20s
   - Adicionar netwatch após schedulers
   - Atualizar versão para v6.9.19

2. Editar `mikrotik-recovery-download/index.ts`:
   - Mesmo padrão de schedulers com delay
   - Atualizar versão para v6.9.19

3. Deploy das Edge Functions

## Teste Após Implementação

Para validar, no MikroTik:

```routeros
# Verificar schedulers
/system scheduler print where name~"navspot"

# Verificar netwatch
/tool netwatch print where comment="navspot-netwatch"

# Simular reboot
/system reboot
```

Após reboot, aguardar 60 segundos e verificar:

```routeros
/log print where message~"NAVSPOT"
/system script print where name="navspot-sync"
```

