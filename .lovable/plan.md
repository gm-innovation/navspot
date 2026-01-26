
# Correção de Listas e Regras de Acesso para Super Admin

## Problema Identificado

O usuário super_admin tem `empresa_id: null`, mas o sistema atual tenta usar `user?.empresa_id` para criar listas e regras de acesso. Isso causa o erro "Empresa não identificada" ao usar templates e impede o cadastro correto.

Além disso, o usuário solicitou:
1. Poder criar listas/regras "globais" (pré-configuradas) sem vincular a uma embarcação
2. No cadastro/edição de embarcações, poder selecionar listas e regras pré-existentes

## Mudanças Propostas

### 1. Adicionar Seletor de Empresa nos Formulários (para Super Admin)

Quando o usuário for `super_admin`, mostrar um campo para selecionar a empresa. Para outros roles, usar automaticamente a empresa do usuário.

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                          Nova Lista de Acesso                                   │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Empresa *         [▼ Navegação Alpha                  ]  ← NOVO (super_admin)│
│                                                                                 │
│  Nome              [Comunicação - WhatsApp             ]                       │
│  Tipo              [▼ Whitelist                        ]                       │
│  Domínios          [*.whatsapp.net, web.whatsapp.com   ]                       │
│  ...                                                                           │
│                                                                                 │
│                      [Cancelar]  [Salvar]                                      │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Integrar Listas de Acesso no Formulário de Embarcação

Adicionar uma seção no formulário de embarcação para selecionar quais listas de acesso aplicar:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                          Nova Embarcação                                        │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  DADOS GERAIS                                                                   │
│  Nome, Tipo, Empresa, etc...                                                   │
│                                                                                 │
│  ────────────────────────────────────────────────────                          │
│  CONFIGURAÇÕES DE REDE (HOTSPOT)                                                │
│  Interface WiFi, Rede, etc...                                                  │
│                                                                                 │
│  ────────────────────────────────────────────────────                          │
│  CONTROLE DE ACESSO                                       ← NOVA SEÇÃO         │
│                                                                                 │
│  Listas de Acesso Aplicadas:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ ☑ Comunicação - WhatsApp (whitelist)                                    │  │
│  │ ☑ Comunicação - Email (whitelist)                                       │  │
│  │ ☐ Redes Sociais (blacklist)                                             │  │
│  │ ☐ Streaming de Vídeo (blacklist)                                        │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  [+ Criar Nova Lista]                                                          │
│                                                                                 │
│                      [Cancelar]  [Cadastrar]                                   │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Lógica de Criação Automática de Regras

Ao salvar a embarcação com listas selecionadas:
- Criar automaticamente regras de acesso vinculando cada lista ao hotspot da embarcação
- Regras criadas com prioridade default e aplicadas a todos os perfis

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/ListasAcesso.tsx` | Adicionar seletor de empresa para super_admin no form |
| `src/pages/RegrasAcesso.tsx` | Adicionar seletor de empresa para super_admin no form |
| `src/components/forms/EmbarcacaoForm.tsx` | Adicionar seção de listas de acesso |
| `src/hooks/useEmbarcacoesWithHotspot.ts` | Criar regras automaticamente ao salvar |

## Fluxo para Super Admin

```text
ANTES (PROBLEMA):
Super Admin → Criar Lista → "Empresa não identificada" ❌

DEPOIS (SOLUÇÃO):
Super Admin → Criar Lista → Seleciona Empresa → Salva ✓
Super Admin → Cadastrar Embarcação → Seleciona Listas → Regras criadas automaticamente ✓
```

## Fluxo para Empresa Admin

```text
ANTES E DEPOIS (SEM MUDANÇA VISUAL):
Empresa Admin → Criar Lista → empresa_id preenchido automaticamente ✓
```

## Implementação Detalhada

### ListasAcesso.tsx - Adicionar Seletor de Empresa

```typescript
// No estado do formulário:
const [selectedEmpresaId, setSelectedEmpresaId] = useState("");

// No JSX, antes do campo Nome:
{user?.role === 'super_admin' && (
  <div className="grid grid-cols-4 items-center gap-4">
    <Label className="text-right">Empresa *</Label>
    <Select
      value={selectedEmpresaId}
      onValueChange={setSelectedEmpresaId}
    >
      <SelectTrigger className="col-span-3">
        <SelectValue placeholder="Selecione a empresa" />
      </SelectTrigger>
      <SelectContent>
        {empresas?.map(emp => (
          <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}

// No handleSubmit:
const empresaId = user?.role === 'super_admin' 
  ? selectedEmpresaId 
  : user?.empresa_id;

if (!empresaId) {
  toast({ title: "Erro", description: "Selecione uma empresa.", variant: "destructive" });
  return;
}
```

### EmbarcacaoForm.tsx - Adicionar Seleção de Listas

```typescript
// Buscar listas da empresa selecionada:
const { data: listasDisponiveis } = useListasAcessoByEmpresa(formData.empresa_id);

// Estado para listas selecionadas:
const [listasAplicadas, setListasAplicadas] = useState<string[]>([]);

// No JSX, nova seção após Hotspot:
<div className="space-y-4">
  <h3>Controle de Acesso</h3>
  <p className="text-sm text-muted-foreground">
    Selecione as listas que serão aplicadas a esta embarcação
  </p>
  {listasDisponiveis?.map(lista => (
    <div key={lista.id} className="flex items-center gap-2">
      <Checkbox
        checked={listasAplicadas.includes(lista.id)}
        onCheckedChange={(checked) => {
          if (checked) {
            setListasAplicadas(prev => [...prev, lista.id]);
          } else {
            setListasAplicadas(prev => prev.filter(id => id !== lista.id));
          }
        }}
      />
      <span>{lista.nome} ({lista.tipo})</span>
    </div>
  ))}
</div>

// No submit, passar as listas selecionadas:
onSubmit({
  embarcacao: { ... },
  hotspot: { ... },
  listasAplicadas: listasAplicadas, // NOVO
});
```

### useEmbarcacoesWithHotspot.ts - Criar Regras Automaticamente

```typescript
// Na mutação de criar embarcação:
async createWithHotspotAndRules({ embarcacao, hotspot, listasAplicadas }) {
  // 1. Criar embarcação
  const { data: embarcacaoData } = await supabase
    .from('embarcacoes')
    .insert(embarcacao)
    .select()
    .single();

  // 2. Criar hotspot
  const { data: hotspotData } = await supabase
    .from('hotspots')
    .insert({ ...hotspot, embarcacao_id: embarcacaoData.id })
    .select()
    .single();

  // 3. Criar regras para cada lista selecionada
  if (listasAplicadas?.length > 0) {
    const regras = listasAplicadas.map((listaId, index) => ({
      lista_id: listaId,
      hotspot_id: hotspotData.id,
      empresa_id: embarcacao.empresa_id,
      acao: 'permitir',
      prioridade: 100 + index,
      ativo: true,
      dias_semana: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'],
    }));

    await supabase.from('regras_acesso').insert(regras);
  }
}
```

## Benefícios

| Mudança | Benefício |
|---------|-----------|
| Seletor de empresa para super_admin | Resolve erro "Empresa não identificada" |
| Listas no form de embarcação | Interface mais intuitiva e centralizada |
| Criação automática de regras | Menos passos para configurar embarcação |
| Filtro de listas por empresa | Mostra apenas listas relevantes |

## Ordem de Implementação

1. **ListasAcesso.tsx** - Adicionar seletor de empresa
2. **RegrasAcesso.tsx** - Adicionar seletor de empresa
3. **useListasAcesso.ts** - Criar hook para buscar listas por empresa
4. **EmbarcacaoForm.tsx** - Adicionar seção de controle de acesso
5. **useEmbarcacoesWithHotspot.ts** - Criar regras automaticamente
