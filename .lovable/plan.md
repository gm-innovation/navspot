
# Plano: Adaptar NAVSPOT para MikroTik hAP ax² (RouterOS 7.x)

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

## Impacto no Sistema NAVSPOT

### O que MELHORA automaticamente

1. **Sem limite de buffer de 3KB**: RouterOS 7.x nao tem a limitacao de `/file get contents` que afeta o v6.x
2. **Flash muito mais rapida**: 128MB NAND vs flash antiga = delays menores necessarios
3. **Mais RAM**: 1GB permite scripts maiores e mais variaveis simultaneas
4. **Suporte a `:rndnum`**: Pode usar gerador aleatorio nativo (nao disponivel em v6.x)
5. **Sintaxe simplificada**: `/ip/firewall/filter` em vez de `/ip firewall filter`

### O que PRECISA ser adaptado

1. **Sintaxe de rotas**: O menu de roteamento mudou significativamente
2. **Interfaces wireless**: WiFi 6 usa menus diferentes (`/interface/wifiwave2`)
3. **Delays conservadores**: Podem ser reduzidos (nao sao mais necessarios os 2500ms)
4. **Action-processor**: Pode voltar ao tamanho original (4387 bytes funciona normalmente)
5. **Deteccao de versao**: Sistema deve detectar automaticamente e usar parametros otimizados

---

## Implementacao Proposta

### Fase 1: Deteccao de Versao do RouterOS

Adicionar no bootstrap a capacidade de detectar a versao do RouterOS e ajustar os parametros automaticamente:

```text
:local rosVer [/system resource get version]
:local isV7 false
:if ([:pick $rosVer 0 1] = "7") do={ :set isV7 true }
:if ($isV7 = true) do={
:log info "NAVSPOT: RouterOS 7.x detectado - modo otimizado"
} else={
:log info "NAVSPOT: RouterOS 6.x detectado - modo compatibilidade"
}
```

### Fase 2: Parametros Condicionais no Instalador

No `mikrotik-scripts`, adicionar parametro `ros_version` opcional:
- `?ros_version=7` = delays reduzidos, action-processor completo
- `?ros_version=6` (default) = comportamento atual conservador

### Fase 3: Script de Bootstrap Otimizado para v7

| Parametro | RouterOS 6.x | RouterOS 7.x |
|-----------|--------------|--------------|
| Delay apos fetch | 2500ms | 500ms |
| Delay apos file write | 1500ms | 300ms |
| Action-processor | ~2400 bytes (reduzido) | ~4500 bytes (completo) |
| Content retry | 3 tentativas | 1 tentativa |
| Flash sync delay | 700ms | 200ms |

### Fase 4: Handlers Adicionais para v7

Restaurar handlers que foram removidos para caber no limite de 3KB:
- `add_firewall_block`
- `add_firewall_allow`
- Suporte a WPA3 (especifico do Wi-Fi 6)

---

## Arquivos a Modificar

### 1. `supabase/functions/mikrotik-scripts/index.ts`

- Adicionar parametro `ros_version` na query string
- Criar funcao `generateInstallerV7()` otimizada
- Condicional para retornar action-processor completo quando `ros_version=7`
- Reduzir todos os delays quando em modo v7

### 2. `supabase/functions/mikrotik-script-generator/index.ts`

- Adicionar campo `ros_version` no hotspot (opcional, default "6")
- Gerar bootstrap com deteccao automatica de versao
- Usar parametros otimizados quando detectar v7
- Passar `ros_version` nas URLs de fetch

### 3. `src/pages/Embarcacoes.tsx` ou UI de Hotspot

- Adicionar selector de "Versao do RouterOS" no formulario de hotspot
- Opcoes: "Auto-detectar", "RouterOS 6.x", "RouterOS 7.x"
- Salvar no banco de dados

### 4. Banco de Dados (migracao)

Adicionar coluna opcional na tabela `hotspots`:

```sql
ALTER TABLE hotspots ADD COLUMN ros_version TEXT DEFAULT '6' 
CHECK (ros_version IN ('6', '7', 'auto'));
```

---

## Estrategia de Teste

### Passo 1: Verificar versao atual no hAP ax²

```routeros
/system resource print
```

Esperado: `version: 7.x.x`

### Passo 2: Testar bootstrap v7.1.33 atual

O bootstrap atual DEVE funcionar no RouterOS 7.x porque:
- Os delays conservadores sao desnecessarios mas nao causam erro
- O action-processor reduzido funciona (apenas com menos handlers)
- A sintaxe eh compativel entre v6 e v7 (spaces ainda sao aceitos)

### Passo 3: Apos implementacao v7.1.34

Testar com `ros_version=7` para validar:
- Delays reduzidos funcionam
- Action-processor completo instala corretamente
- Sem fallback (F)
- Handlers adicionais funcionam

---

## Resumo Executivo

**Boa noticia**: O hAP ax² com RouterOS 7.x vai resolver os problemas de flash timing que encontramos. O bootstrap v7.1.33 atual DEVE funcionar imediatamente, apenas sem aproveitar as otimizacoes possiveis.

**Proximos passos**: Implementar deteccao de versao e parametros condicionais para que o sistema aproveite ao maximo o hardware moderno enquanto mantem compatibilidade com equipamentos legados.

**Risco**: Nenhum. A implementacao eh aditiva e nao quebra compatibilidade com v6.x.
