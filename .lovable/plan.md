

# Remover Campo de Interface WiFi do Formulário de Hotspot

## Justificativa

Com a implementação da **Detecção Inteligente de Interface** no script MikroTik, o campo "Interface WiFi" se tornou desnecessário porque:

1. O script agora detecta automaticamente a melhor interface disponível
2. A lista de prioridade cobre todos os cenários reais de embarcações
3. Configurar manualmente pode causar erros se o usuário escolher uma interface que não existe

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/forms/HotspotForm.tsx` | Remover campo de seleção de interface |

## Alterações

### 1. Remover do Estado Inicial

Remover `interface_wifi` do estado `formData` e definir um valor padrão fixo ("auto" ou manter "wlan1" como fallback).

### 2. Remover do Formulário

Remover as linhas 138-156 que contêm o campo de seleção:

```tsx
// REMOVER este bloco:
<div className="grid grid-cols-4 items-center gap-4">
  <Label htmlFor="interface_wifi" className="text-right">
    Interface WiFi
  </Label>
  <Select
    value={formData.interface_wifi}
    onValueChange={(value) => handleChange("interface_wifi", value)}
  >
    ...
  </Select>
</div>
```

### 3. Valor Padrão

O campo `interface_wifi` será sempre enviado como `"auto"` (ou vazio), sinalizando ao script que deve usar detecção automática.

## Resultado

| Antes | Depois |
|-------|--------|
| Usuário precisa escolher interface | Interface detectada automaticamente |
| Risco de erro por configuração errada | Zero configuração de rede |
| 6 campos no formulário | 5 campos no formulário |

## Formulário Simplificado

Campos que permanecerão:
1. Nome
2. Embarcação
3. Rede (CIDR)
4. Max Usuários
5. Sync Interval

## Compatibilidade

O banco de dados ainda terá a coluna `interface_wifi`, mas será preenchida automaticamente com "auto" ou o valor padrão. O script RSC usa detecção inteligente independente desse valor.

