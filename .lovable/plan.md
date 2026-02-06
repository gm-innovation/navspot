
# Plano: Adaptar NAVSPOT para MikroTik hAP ax² (RouterOS 7.x)

## STATUS: ✅ IMPLEMENTADO (v7.1.34)

## Especificacoes do hAP ax²

| Caracteristica | Valor |
|----------------|-------|
| **Arquitetura** | ARM 64bit |
| **CPU** | IPQ-6010 Quad-core 864 MHz |
| **RAM** | 1 GB (vs ~128MB em modelos antigos) |
| **Storage** | 128 MB NAND (vs ~16MB flash) |
| **RouterOS** | v7 nativo (NAO suporta v6) |
| **Wi-Fi** | 802.11ax (Wi-Fi 6) dual-band |
| **Ethernet** | 5x Gigabit |
| **PoE** | PoE-in e PoE-out na ether1 |

---

## Implementacao v7.1.34

### ✅ Fase 1: Deteccao de Versao do RouterOS
- Bootstrap detecta automaticamente a versao no runtime
- Passa `ros_version` para a API via query string

### ✅ Fase 2: Parametros Condicionais no Instalador
- `mikrotik-scripts` aceita `ros_version=6|7|auto`
- Delays otimizados por versao:

| Parametro | RouterOS 6.x | RouterOS 7.x |
|-----------|--------------|--------------|
| Delay apos fetch | 2500ms | 500ms |
| Delay apos file write | 1500ms | 300ms |
| Content retry | 3 tentativas | 1 tentativa |
| Flash sync delay | 700ms | 200ms |
| Action-processor | ~2400 bytes (CORE) | ~4500 bytes (FULL) |

### ✅ Fase 3: Action Processor FULL para v7
Handlers restaurados para RouterOS 7.x:
- `add_firewall_block` (regras de bloqueio SNI)
- `add_firewall_allow` (regras de permissao)
- `remove_user`
- `disable_user` / `enable_user`
- `kick_session`

### ✅ Fase 4: Banco de Dados
Coluna `ros_version` adicionada na tabela `hotspots`:
- Valores: '6', '7', 'auto' (default: 'auto')
- UI pode ser adicionada posteriormente se necessario

---

## Arquivos Modificados

1. `supabase/functions/mikrotik-scripts/index.ts` - v7.1.34
   - Parametro `ros_version` na query string
   - Funcao `getROSConfig()` para timings por versao
   - `generateActionProcessorFullSource()` para v7
   - Delays condicionais em todo instalador

2. `supabase/functions/mikrotik-script-generator/index.ts` - v7.1.34
   - Busca `ros_version` do hotspot no banco
   - Interface Hotspot atualizada

3. `src/pages/Embarcacoes.tsx`
   - Versao padrao: 7.1.34

4. Migracao: coluna `ros_version` na tabela `hotspots`

---

## Como Testar no hAP ax²

### Passo 1: Verificar versao do RouterOS
```routeros
/system resource print
```
Esperado: `version: 7.x.x`

### Passo 2: Gerar novo bootstrap v7.1.34
O sistema agora detecta automaticamente a versao.
Para forcar modo v7, configure o hotspot com `ros_version=7` no banco.

### Passo 3: Validar nos logs
Logs esperados para RouterOS 7.x:
```
NAVSPOT-INSTALL v7.1.34: Iniciando (ROS 7 mode)...
NAVSPOT-INSTALL: action baixado (~4500 bytes)  <- FULL version
NAVSPOT-INSTALL: action content valido (4387 bytes)
NAVSPOT-INSTALL: navspot-action-processor v7.1.34 instalado
```

---

## Resumo

O sistema NAVSPOT agora e totalmente compativel com:
- **RouterOS 6.x** (modo conservador, action-processor reduzido)
- **RouterOS 7.x** (modo otimizado, action-processor completo, delays reduzidos)

A deteccao eh automatica e nao requer configuracao manual.
