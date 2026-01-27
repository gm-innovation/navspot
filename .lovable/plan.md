
# Plano: Adicionar Configuração Manual de Velocidade, Quota e Regras para Equipamentos

## Problema Identificado

Os dispositivos/equipamentos de embarcação atualmente só podem vincular a um perfil de velocidade. Eles precisam ter a opção de **configuração manual**, assim como os tripulantes têm - permitindo definir:
- Velocidade de download/upload
- Quota de dados (limite em MB)
- Regras de acesso (whitelists/blacklists)

## Solução

Adicionar campo `config_personalizada` (JSONB) na tabela `dispositivos_registrados` e expandir o formulário para incluir campos manuais quando o usuário escolhe "Configuração Personalizada".

---

## Mudanças no Banco de Dados

### Nova Migration

```sql
-- Adicionar config_personalizada para configuração manual de dispositivos
ALTER TABLE dispositivos_registrados 
ADD COLUMN config_personalizada jsonb DEFAULT NULL;

-- Comentário para documentação
COMMENT ON COLUMN dispositivos_registrados.config_personalizada IS 
  'Configuração personalizada: velocidade_download, velocidade_upload, limite_dados_mb, modo_acesso';
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Dispositivos.tsx` | Adicionar modo perfil/personalizado com campos manuais |
| `src/hooks/useDispositivosRegistrados.ts` | Atualizar interface para incluir `config_personalizada` |
| `src/components/modals/DispositivoDetailsModal.tsx` | Exibir configuração manual quando aplicável |

---

## Interface de Configuração Personalizada

```typescript
interface ConfigPersonalizadaDispositivo {
  velocidade_download: string;  // Ex: "5M", "10M"
  velocidade_upload: string;    // Ex: "2M", "5M"
  limite_dados_mb: number | null;  // Quota em MB (null = ilimitado)
  modo_acesso: "permitir_tudo" | "bloquear_tudo";  // Whitelist-only ou permissivo
}
```

---

## Nova UI do Modal (Expandido)

```text
┌──────────────────────────────────────────────────────────────┐
│  Novo Equipamento de Embarcação                        [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ═══ Identificação ═══                                       │
│  MAC Address *        [AA:BB:CC:DD:EE:FF           ]        │
│  Nome                 [Radar Principal              ]        │
│  Tipo                 [Radar                      ▼]        │
│  Embarcação *         [Sonda NS-01                ▼]        │
│                                                              │
│  ═══ Configuração de Acesso ═══                             │
│                                                              │
│  ○ Usar Perfil Pré-configurado                              │
│  ● Configuração Personalizada                               │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Download          [10 Mbps                    ▼]  │    │
│  │  Upload            [5 Mbps                     ▼]  │    │
│  │  Quota de Dados    [500] MB   ☐ Ilimitado           │    │
│  │  Modo de Acesso    [Permitir tudo              ▼]  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ═══ Regras de Acesso (opcional) ═══                        │
│  ☑ Criar regras de acesso para este equipamento             │
│  ┌───────────────────────────────────────┐                  │
│  │ ✓ APIs Externas        [whitelist]   │                  │
│  │ ✓ Navegação Essencial  [whitelist]   │                  │
│  └───────────────────────────────────────┘                  │
│                                                              │
│  ─────────────────────────────────────────────────          │
│  [Autorizado] ●────○                                        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                        [Cancelar]  [Cadastrar]              │
└──────────────────────────────────────────────────────────────┘
```

---

## Detalhes Técnicos

### 1. Estado do Formulário (Dispositivos.tsx)

```typescript
const [newDevice, setNewDevice] = useState({
  mac_address: "",
  nome: "",
  tipo: "outro",
  embarcacao_id: "",
  autorizado: true,
  // Modo de configuração
  modo_config: "perfil" as "perfil" | "personalizado",
  perfil_id: "",
  // Campos personalizados
  velocidade_download: "5M",
  velocidade_upload: "2M",
  limite_dados_mb: null as number | null,
  quota_ilimitada: true,
  modo_acesso: "permitir_tudo",
  // Regras
  criar_regras: false,
  lista_ids: [] as string[],
});
```

### 2. Lógica de Submissão

```typescript
const handleCreateDevice = async () => {
  const formattedMac = formatMacAddress(newDevice.mac_address);
  
  // Construir config_personalizada se modo = personalizado
  const configPersonalizada = newDevice.modo_config === "personalizado" 
    ? {
        velocidade_download: newDevice.velocidade_download,
        velocidade_upload: newDevice.velocidade_upload,
        limite_dados_mb: newDevice.quota_ilimitada ? null : newDevice.limite_dados_mb,
        modo_acesso: newDevice.modo_acesso,
      } 
    : null;

  createDispositivo.mutate({
    mac_address: formattedMac,
    nome: newDevice.nome || `Equipamento ${newDevice.tipo}`,
    tipo: newDevice.tipo,
    embarcacao_id: newDevice.embarcacao_id,
    autorizado: newDevice.autorizado,
    // Se perfil, usa perfil_id; se personalizado, usa config_personalizada
    perfil_id: newDevice.modo_config === "perfil" ? newDevice.perfil_id || null : null,
    config_personalizada: configPersonalizada,
  }, {
    onSuccess: async () => {
      // Criar regras de acesso se solicitado
      if (newDevice.criar_regras && newDevice.lista_ids.length > 0) {
        const regras = newDevice.lista_ids.map((lista_id, index) => ({
          empresa_id: user.empresa_id!,
          lista_id,
          mac_address: formattedMac,
          prioridade: 100 + index,
          ativo: true,
        }));
        await createMultipleRegras.mutateAsync(regras);
      }
      // Reset form...
    }
  });
};
```

### 3. Modal de Detalhes - Exibir Config

No `DispositivoDetailsModal.tsx`:

```tsx
{/* Exibir Perfil ou Config Personalizada */}
{dispositivo.perfil ? (
  <div className="space-y-1">
    <p className="text-sm text-muted-foreground">Perfil de Velocidade</p>
    <Badge variant="outline">{dispositivo.perfil.nome}</Badge>
    <span className="text-sm">
      {dispositivo.perfil.velocidade_download}/{dispositivo.perfil.velocidade_upload}
    </span>
  </div>
) : dispositivo.config_personalizada ? (
  <div className="space-y-1">
    <p className="text-sm text-muted-foreground">Configuração Personalizada</p>
    <div className="text-sm space-y-1">
      <p>↓ {dispositivo.config_personalizada.velocidade_download} / ↑ {dispositivo.config_personalizada.velocidade_upload}</p>
      {dispositivo.config_personalizada.limite_dados_mb && (
        <p>Quota: {dispositivo.config_personalizada.limite_dados_mb} MB</p>
      )}
      <Badge variant="outline">
        {dispositivo.config_personalizada.modo_acesso === 'permitir_tudo' 
          ? 'Acesso Total' 
          : 'Whitelist Only'}
      </Badge>
    </div>
  </div>
) : (
  <p className="text-sm text-muted-foreground">Sem configuração específica</p>
)}
```

---

## Fluxo Completo

```text
1. Admin abre modal "Novo Equipamento"
2. Preenche MAC, nome, tipo, embarcação
3. Escolhe "Configuração Personalizada" (radio button)
4. Define: 10M download, 5M upload, 500MB quota, "Permitir tudo"
5. Marca "Criar regras de acesso"
6. Seleciona listas: "APIs Externas", "Navegação Essencial"
7. Clica "Cadastrar"
8. Sistema:
   a. Cria dispositivo com config_personalizada (JSON)
   b. Cria 2 regras de acesso (uma por lista) com mac_address
9. Toast: "Dispositivo cadastrado com configuração personalizada"
```

---

## Resumo das Mudanças

| Componente | Mudança |
|------------|---------|
| **Banco de dados** | Nova coluna `config_personalizada` (JSONB) |
| **Formulário** | Radio buttons Perfil/Personalizado + campos manuais |
| **Hook** | Interface atualizada para incluir config |
| **Modal detalhes** | Exibe config ou perfil conforme o caso |
| **Criação** | Salva perfil_id OU config_personalizada (mutuamente exclusivos) |

---

## Benefícios

- **Flexibilidade**: Equipamentos podem ter configuração específica sem criar um perfil
- **Consistência**: Mesmo padrão usado para tripulantes
- **Simplicidade**: Admin configura tudo em um único lugar
- **Controle**: Quota, velocidade e regras de acesso por equipamento
