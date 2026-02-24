

# Plano: Corrigir Template `sync` e URL do Guardian

## Diagnóstico Confirmado

### Bug 1 — Template `sync` (v7.8.26) com 2 instâncias do padrão problemático

```text
Linha: :local val [:pick $ln ($p1 + 1) [:len $ln]]
Linha: :local pw [:pick $val ($p2 + 1) [:len $val]]
```

### Bug 2 — Guardian aponta para endpoint legado `mt-gen`

No template `guardian-standalone`, o health check usa:

```text
/tool fetch url="{{API_BASE}}/mt-gen?mode=health"
```

Deveria ser `gen7post` com POST, não `mt-gen` com GET. Isso significa que o guardian nunca consegue verificar a versão corretamente e pode disparar reparos desnecessários.

## Alterações

### 1. SQL UPDATE no template `sync` (v7.8.26 → v7.8.27)

Duas substituições mecânicas:

```text
ANTES:  :local val [:pick $ln ($p1 + 1) [:len $ln]]
DEPOIS: :local lnLen [:len $ln]
        :local val [:pick $ln ($p1 + 1) $lnLen]

ANTES:  :local pw [:pick $val ($p2 + 1) [:len $val]]
DEPOIS: :local valLen [:len $val]
        :local pw [:pick $val ($p2 + 1) $valLen]
```

### 2. SQL UPDATE no template `guardian-standalone` (v7.8.6 → v7.8.7)

Corrigir o health check de `mt-gen` (legado, GET) para `gen7post` (atual, POST):

```text
ANTES:
/tool fetch url="{{API_BASE}}/mt-gen?mode=health" as-value output=user

DEPOIS:
/tool fetch url="{{API_BASE}}/gen7post" http-method=post http-data="{\"mode\":\"health\"}" http-header-field="Content-Type: application/json" as-value output=user
```

Dentro do script source (já escapado), o correto será:

```text
/tool fetch url=\"{{API_BASE}}/gen7post\" http-method=post http-data=\"{\\\"mode\\\":\\\"health\\\"}\" http-header-field=\"Content-Type: application/json\" as-value output=user
```

### 3. Remoção da edge function `mt-recovery`

Deletar `supabase/functions/mt-recovery/index.ts` e a função deployada. Essa função legada (v7.1.61) usa `type:"all"` e escaping com `\\$`, podendo causar problemas se chamada acidentalmente.

## Detalhes Técnicos

- O template `sync` é usado apenas pelo antigo endpoint `mikrotik-script-generator`, não pelo `gen7post`. O fix é preventivo para eliminar código bugado do banco.
- O template `guardian-standalone` é usado ativamente pelo `gen7post` nos modos `serve` (type=all, type=recovery) e `generate`. O health check apontando para `mt-gen` faz com que o guardian falhe silenciosamente no check de versão, pois `mt-gen` pode não existir mais ou retornar dados diferentes.
- A remoção do `mt-recovery` requer deletar o arquivo e chamar a ferramenta de delete de edge functions.

