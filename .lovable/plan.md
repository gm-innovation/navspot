
# Sistema de Periodo de Renovacao de Quota com Fuso Horario

## Resumo do Requisito

O sistema precisa:

1. **Periodo da quota**: Definir se o limite de dados renova por hora, dia, semana ou mes
2. **Renovacao automatica**: Resetar `bytes_consumidos` no inicio de cada periodo
3. **Fuso horario**: Considerar o timezone correto, pois navios navegam entre diferentes fusos (Brasil tem 3 fusos: -2, -3, -4)
4. **Flexibilidade**: Permitir configurar fuso por empresa ou embarcacao

## Arquitetura da Solucao

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      FLUXO DE RENOVACAO DE QUOTA                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  CONFIGURACAO                                                                   │
│  ─────────────                                                                  │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ Perfil de Velocidade                                                   │    │
│  │ ──────────────────────────────────────────────────────────────────────│    │
│  │ Limite de Dados: [500 MB]                                             │    │
│  │ Periodo:         [▼ Diario / Semanal / Mensal / Por Hora]             │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │ Empresa / Embarcacao                                                   │    │
│  │ ──────────────────────────────────────────────────────────────────────│    │
│  │ Fuso Horario: [▼ America/Sao_Paulo (-3) / America/Manaus (-4) / ...]  │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  VERIFICACAO NO SYNC                                                           │
│  ────────────────────                                                          │
│                                                                                 │
│  mikrotik-sync recebe dados                                                    │
│           │                                                                     │
│           ▼                                                                     │
│  ┌────────────────────────────────────────┐                                    │
│  │ Verificar: Novo periodo iniciou?       │                                    │
│  │ (baseado no fuso da embarcacao)        │                                    │
│  └────────────────────────────────────────┘                                    │
│           │                                                                     │
│     ┌─────┴─────┐                                                              │
│     │           │                                                              │
│   SIM          NAO                                                             │
│     │           │                                                              │
│     ▼           ▼                                                              │
│  ┌────────────────────────┐    ┌────────────────────────┐                      │
│  │ Resetar bytes_consumidos│    │ Continuar contagem    │                      │
│  │ para zero              │    │ normal                 │                      │
│  │ Atualizar quota_reset_at│    │                        │                      │
│  └────────────────────────┘    └────────────────────────┘                      │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Mudancas no Banco de Dados

### 1. Tabela perfis_velocidade

Adicionar colunas:

| Campo | Tipo | Default | Descricao |
|-------|------|---------|-----------|
| `quota_periodo` | TEXT | 'diario' | Periodo de renovacao: 'hora', 'diario', 'semanal', 'mensal' |

### 2. Tabela empresas

Adicionar coluna de fuso horario padrao:

| Campo | Tipo | Default | Descricao |
|-------|------|---------|-----------|
| `timezone` | TEXT | 'America/Sao_Paulo' | Fuso horario padrao da empresa |

### 3. Tabela embarcacoes

Adicionar coluna de fuso horario (pode sobrescrever o da empresa):

| Campo | Tipo | Default | Descricao |
|-------|------|---------|-----------|
| `timezone` | TEXT | NULL | Fuso especifico da embarcacao (se NULL, usa da empresa) |

### 4. Tabela tripulantes

Adicionar coluna para rastrear ultima renovacao:

| Campo | Tipo | Default | Descricao |
|-------|------|---------|-----------|
| `quota_reset_at` | TIMESTAMP | NULL | Data/hora do ultimo reset de quota |

## Fusos Horarios do Brasil

Os navios brasileiros navegam principalmente nestas zonas:

| Fuso | Timezone IANA | Regioes |
|------|---------------|---------|
| UTC-2 | America/Noronha | Fernando de Noronha |
| UTC-3 | America/Sao_Paulo | Sul, Sudeste, Nordeste costeiro |
| UTC-4 | America/Manaus | Amazonia ocidental |

## Logica de Renovacao

### Verificacao no mikrotik-sync

```typescript
function shouldResetQuota(
  tripulante: { quota_reset_at: string | null },
  perfil: { quota_periodo: string },
  timezone: string
): boolean {
  if (!tripulante.quota_reset_at) return true // Primeira vez
  
  const now = new Date()
  const lastReset = new Date(tripulante.quota_reset_at)
  
  // Converter para timezone local
  const nowLocal = toZonedTime(now, timezone)
  const lastResetLocal = toZonedTime(lastReset, timezone)
  
  switch (perfil.quota_periodo) {
    case 'hora':
      // Resetar se hora mudou
      return nowLocal.getHours() !== lastResetLocal.getHours() ||
             nowLocal.getDate() !== lastResetLocal.getDate()
    
    case 'diario':
      // Resetar se passou da meia-noite
      return nowLocal.getDate() !== lastResetLocal.getDate() ||
             nowLocal.getMonth() !== lastResetLocal.getMonth()
    
    case 'semanal':
      // Resetar se passou domingo->segunda (ou inicio da semana)
      return getWeekNumber(nowLocal) !== getWeekNumber(lastResetLocal)
    
    case 'mensal':
      // Resetar se mudou de mes
      return nowLocal.getMonth() !== lastResetLocal.getMonth() ||
             nowLocal.getFullYear() !== lastResetLocal.getFullYear()
    
    default:
      return false // 'ilimitado' ou desconhecido
  }
}
```

### Execucao do Reset

Quando detectar novo periodo:

```typescript
if (shouldResetQuota(tripulante, perfil, embarcacaoTimezone)) {
  await supabase
    .from('tripulantes')
    .update({
      bytes_consumidos: 0,
      quota_reset_at: new Date().toISOString()
    })
    .eq('id', tripulante.id)
  
  console.log(`[mikrotik-sync] Quota renovada para ${tripulante.nome}`)
}
```

## Interface do Formulario de Perfil

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                        Perfil de Velocidade                                     │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Limites de Banda                                                              │
│  ──────────────────────────────────────────────────────────────────────────── │
│  Download    [10M           ]     Upload    [5M           ]                   │
│                                                                                │
│  Limite de Dados                                                               │
│  ──────────────────────────────────────────────────────────────────────────── │
│  Quota       [500           ] MB                                              │
│  Periodo     [▼ Diario                                    ]                   │
│              ├─ Por Hora (renova a cada hora cheia)                           │
│              ├─ Diario (renova a meia-noite)                                  │
│              ├─ Semanal (renova toda segunda-feira)                           │
│              └─ Mensal (renova no dia 1)                                      │
│                                                                                │
│  ℹ️ O horario de renovacao segue o fuso da embarcacao/empresa.                │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Interface de Configuracao de Fuso (Empresa)

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                        Configuracoes da Empresa                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Fuso Horario Padrao                                                           │
│  ──────────────────────────────────────────────────────────────────────────── │
│  [▼ America/Sao_Paulo (UTC-3) - Brasilia                              ]       │
│                                                                                │
│  Opcoes disponiveis:                                                           │
│  • America/Noronha (UTC-2) - Fernando de Noronha                              │
│  • America/Sao_Paulo (UTC-3) - Brasilia, SP, RJ                               │
│  • America/Manaus (UTC-4) - Manaus, Amazonia                                  │
│  • America/Rio_Branco (UTC-5) - Acre                                          │
│                                                                                │
│  ℹ️ Embarcacoes podem ter fuso diferente se navegarem em outras regioes.      │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Interface de Configuracao de Fuso (Embarcacao)

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                        Configuracoes da Embarcacao                              │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Fuso Horario                                                                  │
│  ──────────────────────────────────────────────────────────────────────────── │
│  [✓] Usar fuso horario da empresa (America/Sao_Paulo)                         │
│  [ ] Definir fuso horario especifico                                          │
│      [▼ America/Manaus (UTC-4)                                        ]       │
│                                                                                │
│  ℹ️ Configure um fuso especifico se a embarcacao navegar frequentemente       │
│     em areas com fuso diferente da sede da empresa.                           │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| Migracao SQL | Criar | Adicionar quota_periodo, timezone, quota_reset_at |
| `src/hooks/usePerfisVelocidade.ts` | Modificar | Adicionar constante PERIODOS_QUOTA |
| `src/pages/PerfisVelocidade.tsx` | Modificar | Adicionar campo de periodo no formulario |
| `src/hooks/useEmpresas.ts` | Modificar | Adicionar timezone no CRUD |
| `src/hooks/useEmbarcacoes.ts` | Modificar | Adicionar timezone no CRUD |
| `src/components/forms/EmbarcacaoForm.tsx` | Modificar | Adicionar campo de timezone |
| `supabase/functions/mikrotik-sync/index.ts` | Modificar | Implementar logica de renovacao |

## Exibicao de Informacao de Quota

Na pagina de Tripulantes ou Dashboard, mostrar:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│  Joao Silva                                                                    │
│  ──────────────────────────────────────────────────────────────────────────── │
│  Quota: 450 MB / 500 MB (90%)  [==========-]                                  │
│  Periodo: Diario                                                              │
│  Renova em: 2h 15min (meia-noite horario local)                               │
│  Fuso: America/Sao_Paulo (UTC-3)                                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Casos de Uso Especiais

### 1. Navio muda de fuso

Se o navio navega de Sao Paulo (-3) para Manaus (-4):
- O admin pode atualizar o timezone da embarcacao
- O sistema recalcula o periodo com base no novo fuso
- Comportamento conservador: se a quota deveria resetar mas o fuso mudou, aguarda proximo ciclo

### 2. Tripulante sem perfil (config personalizada)

Para tripulantes com `config_personalizada`:
- Adicionar campo `quota_periodo` no JSON
- Usar timezone da embarcacao normalmente

### 3. Primeiro acesso

Se `quota_reset_at` for NULL:
- Setar como momento atual
- Iniciar contagem do zero

## Alerta de Renovacao

Opcionalmente, gerar alerta informativo quando quota renovar:

```typescript
// Tipo: quota_renewed (info)
await createAlertIfNotRecent(supabase, {
  tipo: 'quota_renewed',
  severidade: 'info',
  mensagem: `Quota renovada para ${tripulante.nome} - Periodo: ${perfil.quota_periodo}`,
  tripulante_id: tripulante.id,
  embarcacao_id: embarcacao.id
}, 60 * 24) // Apenas 1 alerta por dia por tripulante
```

## Ordem de Implementacao

1. **Migracao SQL**: Adicionar colunas quota_periodo, timezone, quota_reset_at
2. **Constantes e hooks**: Adicionar PERIODOS_QUOTA e TIMEZONES_BRASIL
3. **Formulario de Perfil**: Adicionar campo de periodo
4. **Formulario de Embarcacao**: Adicionar campo de timezone
5. **mikrotik-sync**: Implementar logica de renovacao
6. **UI de exibicao**: Mostrar info de renovacao na lista de tripulantes
7. **Testes**: Simular mudancas de periodo e fuso

## Consideracoes Tecnicas

1. **Performance**: A verificacao de periodo e feita apenas durante o sync, nao em tempo real
2. **Precisao**: O reset pode ter delay de alguns minutos (intervalo do sync)
3. **Timezone library**: Usar funcoes nativas de Date com toLocaleString ou biblioteca como date-fns-tz
4. **Historico**: O campo `quota_reset_at` serve para auditoria e depuracao

## Beneficios

| Funcionalidade | Beneficio |
|----------------|-----------|
| Periodo configuravel | Flexibilidade para diferentes cenarios de uso |
| Fuso horario | Precisao para embarcacoes em diferentes regioes |
| Renovacao automatica | Sem necessidade de intervencao manual |
| Hierarquia de timezone | Empresa define padrao, embarcacao pode sobrescrever |
| Auditoria | Registro de quando a quota foi renovada |
