

# Script Bootstrap v5.2 - Limpeza Total de Bridges + Aviso de Desconexao

## Problema Identificado

Quando o script e executado via terminal do Winbox, ele:

1. Remove a bridge padrao (defconf) enquanto o usuario esta conectado por ela
2. A sessao do Winbox cai
3. O script para de executar no meio
4. O MikroTik fica em estado inconsistente

O script v5.1 atual NAO limpa as bridges existentes antes de criar a bridge1, causando conflitos.

---

## Mudancas Necessarias

### 1. Frontend - Adicionar Aviso no ScriptModal

Antes de mostrar o script, exibir um alerta amarelo com instrucoes de seguranca:

| Item | Conteudo |
|------|----------|
| Titulo | Atencao: Voce perdera a conexao por 10-15 segundos |
| Instrucao 1 | Cole o script inteiro no terminal do MikroTik |
| Instrucao 2 | Feche o Winbox imediatamente apos colar (nao espere terminar) |
| Instrucao 3 | Aguarde 30 segundos |
| Instrucao 4 | Reconecte via 192.168.88.1 |
| Alternativa | Salve o script como .rsc, faca upload via Files no Winbox, e execute via /import |

### 2. Backend - Script v5.2 com Limpeza Total de Bridges

Adicionar bloco de limpeza de bridges ANTES de criar a bridge1:

```text
Estrutura v5.2:
1. Cabecalho + Versao 5.2
2. Variaveis (WANIF, WANTYPE, DNSNAME, TOKEN)
3. Validar WAN existe
4. PROTECAO WAN - remover de todas as bridges
5. LIMPEZA TOTAL DE BRIDGES (NOVO - critico)
   a) Remover TODAS as bridge ports
   b) Remover TODAS as bridges (incluindo defconf)
   c) Delay 3s para estabilizar
6. Configurar DHCP client na WAN
7. Criar bridge1 (ambiente limpo)
8. Adicionar portas LAN
9. IP/Pool/DHCP/DNS
10. NAT explicito na WAN
11. Hotspot Profile + Server
12. Walled Garden basico
13. Token file
14. Script sync (inline)
15. Scheduler
16. Verificacao final
17. Log final v5.2
```

---

## Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/components/modals/ScriptModal.tsx` | Modificar | Adicionar aviso de desconexao e instrucoes de seguranca |
| `supabase/functions/mikrotik-script-generator/index.ts` | Modificar | Script v5.2 com limpeza total de bridges |

---

## Detalhes da Implementacao

### ScriptModal.tsx - Novo Aviso

Adicionar um componente Alert antes do textarea do script:

```tsx
<Alert className="bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400">
  <AlertTriangle className="h-4 w-4" />
  <AlertTitle>Atencao: Voce perdera a conexao por 10-15 segundos</AlertTitle>
  <AlertDescription>
    <p>Durante a instalacao, a conexao com o MikroTik sera interrompida. Para evitar problemas:</p>
    <ol>
      <li>Cole o script inteiro no terminal do MikroTik</li>
      <li>Feche o Winbox imediatamente apos colar (nao espere terminar)</li>
      <li>Aguarde 30 segundos</li>
      <li>Reconecte via 192.168.88.1</li>
    </ol>
    <p><strong>Alternativa segura:</strong> Use o botao "Download .rsc", faca upload via Files no Winbox, e execute: /import navspot-bootstrap.rsc</p>
  </AlertDescription>
</Alert>
```

### Script Generator - Bloco de Limpeza v5.2

Novo bloco a ser inserido apos a protecao da WAN:

```routeros
# 3. LIMPEZA TOTAL DE BRIDGES (INCLUINDO defconf)
:log warning "NAVSPOT: Removendo todas as bridges e ports existentes..."
/interface bridge port
:foreach bp in=[find] do={ :do { remove $bp } on-error={} }

/interface bridge
:foreach b in=[find] do={
  :local bName [get $b name]
  :log warning ("NAVSPOT: Removendo bridge: " . $bName)
  :do { remove $b } on-error={}
}

:delay 3s
:log info "NAVSPOT: Bridges limpas"
```

---

## Comparacao v5.1 vs v5.2

| Aspecto | v5.1 | v5.2 |
|---------|------|------|
| Limpa bridge defconf | Nao | Sim (loop em todas) |
| Limpa bridge ports | So da WAN | Todas as ports |
| Delay apos limpeza | Nenhum | 3 segundos |
| Aviso no frontend | Nao | Sim (alert amarelo) |
| Instrucoes de reconexao | Basicas | Detalhadas |
| Opcao import .rsc | Nao mencionada | Recomendada |

---

## Estrutura Completa do Script v5.2

```text
# ============================================
# NAVSPOT Bootstrap Script v5.2 - PRODUCAO
# ============================================

:local WANIF "ether1"
:local WANTYPE "dhcp"
:local DNSNAME "{{DNS_NAME}}"
:local TOKEN "{{SYNC_TOKEN}}"

:log info "NAVSPOT v5.2: Iniciando instalacao..."

# 1. VALIDACAO DA WAN
[validar que interface existe]

# 2. PROTECAO DA WAN
[remover WAN de bridges, verificar se liberada]

# 3. LIMPEZA TOTAL DE BRIDGES (NOVO)
/interface bridge port
:foreach bp in=[find] do={ :do { remove $bp } on-error={} }
/interface bridge
:foreach b in=[find] do={
  :local bName [get $b name]
  :log warning ("NAVSPOT: Removendo bridge: " . $bName)
  :do { remove $b } on-error={}
}
:delay 3s

# 4. CONFIGURAR WAN (DHCP)
[dhcp-client na WAN]

# 5. CRIAR BRIDGE1
/interface bridge add name="bridge1" comment="navspot"
enable [find name="bridge1"]
:delay 2s

# 6-14. [resto do script igual v5.1]

# 15. VERIFICACAO FINAL
[garantir WAN isolada]

:log info "NAVSPOT v5.2: Bootstrap concluido!"
```

---

## Secao Tecnica

### Ordem de Execucao Critica

A limpeza de bridges DEVE ocorrer na seguinte ordem:

1. Primeiro: Remover WAN de bridges (protecao)
2. Segundo: Remover TODAS as bridge ports (esvaziar bridges)
3. Terceiro: Remover TODAS as bridges (eliminar defconf)
4. Quarto: Delay 3s (aguardar kernel estabilizar)
5. Quinto: Criar bridge1 nova (ambiente limpo)

### Por que a Limpeza Total e Necessaria

O MikroTik vem com uma bridge padrao chamada `defconf` ou `bridgeLocal` que:
- Contem todas as portas ethernet (ether1-ether5)
- E usada para acesso inicial via Winbox
- Conflita com a bridge1 do NAVSPOT

Se nao for removida:
- As portas ficam em duas bridges ao mesmo tempo
- O roteamento fica inconsistente
- A WAN pode acabar na bridge do hotspot

### Delay de 3 Segundos

O delay apos remover bridges e necessario porque:
- O kernel do RouterOS precisa de tempo para liberar recursos
- Interfaces que estavam em bridges precisam ser "re-descobertas"
- Operacoes subsequentes podem falhar se executadas muito rapido

