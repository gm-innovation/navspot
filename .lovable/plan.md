

# Adicionar IP Binding para Bypass Administrativo

## Problema Identificado

As regras de firewall para WinBox (8291) e SSH (22) usam `src-address` corretamente, porem o MikroTik Hotspot intercepta todo o trafego **antes** do firewall processar. Isso significa que um administrador na rede local nao consegue acessar o WinBox porque o Hotspot exige login primeiro.

## Solucao

Adicionar uma secao de **IP Binding** que configura o bypass do Hotspot para a rede administrativa. O IP Binding permite que determinados enderecos IP ignorem completamente a autenticacao do Hotspot.

## Arquivo a Modificar

| Arquivo | Alteracoes |
|---------|------------|
| `supabase/functions/mikrotik-script-generator/index.ts` | Adicionar secao IP Binding apos Firewall Rules (linha 515) |

## Codigo a Adicionar

Inserir apos a linha 515 (fim do bloco de Firewall) e antes da linha 517 (inicio do Sync Token):

```typescript
  // IP Binding for administrative access bypass
  script += `
# ============================================
# IP Binding (Administrative Access Bypass)
# ============================================
/ip hotspot ip-binding
:do { remove [find comment~"navspot-admin-bypass"] } on-error={}

# Bypass hotspot authentication for local network (administrative access)
# This allows WinBox/SSH access without hotspot login requirement
add address=${networkCidr} type=bypassed comment="navspot-admin-bypass"

`;
```

## Fluxo de Trafego com a Correcao

```text
Administrador (192.168.88.x)
    |
    v
+-------------------+
| IP Binding Check  |
| address=88.0/24   |
| type=bypassed     | ---> BYPASS (nao precisa login)
+-------------------+
    |
    v
+-------------------+
| Firewall Rules    |
| WinBox: ACCEPT    |
| SSH: ACCEPT       |
+-------------------+
    |
    v
Acesso Liberado ao Roteador
```

## Resumo da Mudanca

| Componente | Antes | Depois |
|------------|-------|--------|
| IP Binding | Nao existia | Bypass para rede administrativa |
| WinBox Access | Bloqueado pelo Hotspot | Funciona via bypass |
| SSH Access | Bloqueado pelo Hotspot | Funciona via bypass |

## Beneficios

1. **Acesso Administrativo Garantido**: WinBox e SSH funcionam sem precisar fazer login no Hotspot
2. **Seguranca Mantida**: Apenas a rede local (192.168.88.0/24 ou range configurado) tem bypass
3. **Consistencia**: Usa a variavel `${networkCidr}` igual as regras de firewall

## Consideracao de Seguranca

O bypass e restrito ao CIDR da rede local do hotspot. Tripulantes que se conectam via WiFi recebem IPs desse range, mas o bypass apenas evita a tela de login - as regras de firewall ainda aplicam restricoes (WinBox/SSH apenas, outras portas bloqueadas).

