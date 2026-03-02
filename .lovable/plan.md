

# Fix linha 92: `login-url` em `set` também falha com full path

## Diagnóstico

RSC renderizado, linha 92 (contando do início do conteúdo):
```
/ip hotspot profile set $profIdx login-url=$lurl
```
Coluna 34 = `login-url`. O parser do RouterOS interpreta `login` como keyword mesmo no `set` com caminho completo.

## Correção

Usar **menu context** — entrar no submenu `/ip hotspot profile` antes do `set`. Dentro do contexto do submenu, `login-url` é reconhecido como propriedade sem ambiguidade:

```routeros
# 7. Hotspot Profile (add + set em menu context para evitar parse error com login-url)
/ip hotspot profile add name=$hspName login-by=http-chap,http-pap http-cookie-lifetime=0s hotspot-address=$lanIp dns-name="portal.navspot.com.br"
/ip hotspot profile
:local profIdx [find name=$hspName]
set $profIdx login-url=$lurl
```

## Implementação

1. **SQL UPDATE `script_templates` (id='infra')** — substituir as 3 linhas do hotspot profile (add + find + set) por 4 linhas usando menu context
2. **`.lovable/plan.md`** — atualizar regra de ouro: usar menu context (`/ip hotspot profile` + `set` separado) em vez de full-path `set`
3. **Renderizar via gen7post** — validar que a linha problemática não existe mais

