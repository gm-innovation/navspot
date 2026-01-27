
# Plano: Melhorar Feedback de Loading e Exibir Regras no Modal de Perfil

## Problemas Identificados

### 1. Falta de Loading ao Gerar Script
Na página de Embarcações, ao clicar no botão `<Code />`, o script começa a ser gerado mas não há indicação visual clara:
- O botão tem `disabled={generateScript.isPending}` mas não mostra spinner
- Não há overlay ou texto indicando que está processando
- O usuário fica sem feedback por alguns segundos

### 2. Modal de Perfil não Mostra Regras
O modal de edição/criação de perfil não exibe as regras de acesso associadas ao perfil:
- As regras existem na tabela `regras_acesso` com `perfil_id`
- O usuário não sabe quais listas estão aplicadas ao perfil
- Seria útil exibir um resumo das regras (whitelists/blacklists)

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Embarcacoes.tsx` | Adicionar loading spinner no botão de gerar script |
| `src/pages/PerfisVelocidade.tsx` | Buscar e exibir regras do perfil no modal |
| `src/hooks/useRegrasAcesso.ts` | Adicionar hook `useRegrasByPerfil` para filtrar regras |

---

## Detalhes Técnicos

### 1. Loading no Botão de Gerar Script (Embarcacoes.tsx)

**Problema atual (linha 323-331):**
```tsx
<Button 
  variant="outline" 
  size="sm"
  onClick={() => handleGenerateScript(embarcacao)}
  disabled={!hotspot || generateScript.isPending}
  title={hotspot ? "Gerar Script MikroTik" : "Configure a rede primeiro"}
>
  <Code className="h-4 w-4" />
</Button>
```

**Solução:**
- Adicionar estado para rastrear qual embarcação está gerando script
- Mostrar spinner (Loader2) quando está gerando
- Opcionalmente abrir modal de loading ou mostrar toast informativo

```tsx
// State para rastrear geração em andamento
const [generatingFor, setGeneratingFor] = useState<string | null>(null);

const handleGenerateScript = (embarcacao: EmbarcacaoWithStats) => {
  const hotspot = getHotspotForEmbarcacao(embarcacao.id);
  if (!hotspot) return;
  
  setGeneratingFor(embarcacao.id);
  setCurrentHotspotId(hotspot.id);
  setCurrentHotspotName(embarcacao.nome);
  
  generateScript.mutate(hotspot.id, {
    onSuccess: (data) => {
      setCurrentScript(data.script || "# Script não gerado");
      setScriptModalOpen(true);
      setGeneratingFor(null);
    },
    onError: () => {
      setGeneratingFor(null);
    }
  });
};

// No botão:
<Button 
  variant="outline" 
  size="sm"
  onClick={() => handleGenerateScript(embarcacao)}
  disabled={!hotspot || generatingFor === embarcacao.id}
>
  {generatingFor === embarcacao.id ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Code className="h-4 w-4" />
  )}
</Button>
```

### 2. Exibir Regras no Modal de Perfil (PerfisVelocidade.tsx)

**Nova seção no modal** após "Controle de Acesso":

```tsx
{/* Regras de Acesso Aplicadas */}
{editingPerfil && (
  <div className="space-y-4 border-t pt-4">
    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
      Regras de Acesso Aplicadas
    </h3>
    <RegrasDoPerfil perfilId={editingPerfil.id} />
  </div>
)}
```

**Componente RegrasDoPerfil:**
- Buscar regras onde `perfil_id === perfilId`
- Agrupar por tipo de lista (whitelist/blacklist)
- Exibir badges com nome das listas
- Link para página de Regras de Acesso

```tsx
function RegrasDoPerfil({ perfilId }: { perfilId: string }) {
  const { data: regras } = useRegrasAcesso();
  
  const regrasDoPerfil = regras?.filter(r => r.perfil_id === perfilId) || [];
  const whitelists = regrasDoPerfil.filter(r => r.lista?.tipo === 'whitelist');
  const blacklists = regrasDoPerfil.filter(r => r.lista?.tipo === 'blacklist');
  
  if (regrasDoPerfil.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma regra específica. 
        {formData.herdar_regras_empresa && " Herda regras da empresa."}
      </p>
    );
  }
  
  return (
    <div className="space-y-3">
      {whitelists.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Whitelists:</p>
          <div className="flex flex-wrap gap-1">
            {whitelists.map(r => (
              <Badge key={r.id} variant="outline" className="bg-green-50">
                {r.lista?.nome}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {blacklists.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Blacklists:</p>
          <div className="flex flex-wrap gap-1">
            {blacklists.map(r => (
              <Badge key={r.id} variant="outline" className="bg-red-50">
                {r.lista?.nome}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Gerencie regras em <Link to="/regras-acesso">Regras de Acesso</Link>
      </p>
    </div>
  );
}
```

### 3. Hook Opcional para Filtrar Regras (useRegrasAcesso.ts)

```typescript
export function useRegrasByPerfil(perfilId: string | undefined) {
  return useQuery({
    queryKey: ['regras_acesso', 'by_perfil', perfilId],
    queryFn: async () => {
      if (!perfilId) return [];
      
      const { data, error } = await supabase
        .from('regras_acesso')
        .select(`
          *,
          lista:listas_acesso(id, nome, tipo)
        `)
        .eq('perfil_id', perfilId)
        .order('prioridade');

      if (error) throw error;
      return data;
    },
    enabled: !!perfilId,
  });
}
```

---

## Resumo Visual

| Componente | Antes | Depois |
|------------|-------|--------|
| Botão gerar script | Ícone estático, sem feedback | Spinner durante geração |
| Modal de Perfil | Sem info de regras | Seção com whitelists/blacklists |
| UX de loading | Usuário confuso | Feedback visual claro |

---

## Fluxo de Usuário Melhorado

```text
1. Usuário clica em </> para gerar script
2. Botão mostra spinner (Loader2 animando)
3. Após 2-3 segundos, modal abre com script
4. Spinner para, modal exibe conteúdo
```

```text
1. Usuário edita um perfil
2. Modal abre com informações do perfil
3. Seção "Regras de Acesso Aplicadas" mostra:
   - Whitelists: Email, WhatsApp
   - Blacklists: Redes Sociais
   - Link: "Gerencie regras em Regras de Acesso"
```
