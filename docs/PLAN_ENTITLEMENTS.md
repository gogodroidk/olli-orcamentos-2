# PLAN_ENTITLEMENTS — entitlements por CHAVE com limites

> Substitui gradualmente o `RECURSOS_POR_PLANO: Set<Recurso>` de `src/services/planos.ts`.
> Fonte da verdade do PLANO continua sendo o webhook Stripe (tabela `assinaturas`).
> Este documento é a fonte da verdade dos LIMITES.

## A DECISÃO do plano grátis (firme, sem "depende")

Havia tensão: o dono quer "grátis ruim o bastante para converter"; o mestre exige
"grátis não humilhante, que prova valor". **Decisão: os dois estão certos sobre coisas
diferentes — o grátis é GENEROSO no fluxo e DESCONFORTÁVEL na apresentação.**

1. **Criar orçamento, recibo, cliente e agenda: LIVRES E ILIMITADOS, para sempre.**
   Limitar a criação mata a ativação e o hábito — e sem hábito não há conversão.
   `quotes.monthly_limit = null` em TODOS os planos. Esta chave existe no sistema
   como válvula futura, mas a decisão de produto é não usá-la.
2. **O motor de conversão é a MARCA OLLI no material que o cliente final vê.**
   PDF do grátis leva rodapé discreto "Feito com OLLI Orçamentos" + o link público
   `/o/<token>` leva o selo. O prestador não sofre nada no SEU fluxo; ele sente na
   frente do CLIENTE dele — é exatamente aí que R$ 39/mês vira barato. Vaidade
   profissional converte mais que paywall de funcionalidade.
3. **1 template no grátis** (`editorial`). Os demais ficam VISÍVEIS com preview e
   selo PRO (dá vontade, nunca esconde). — Ajuste sobre o plano da onda PDF v2,
   que previa 3 grátis: fica 1.
4. **3 usos de IA/mês no grátis** (já implementado). Ao esgotar: mensagem calorosa
   + CTA, nunca erro seco.
5. **Nada de "em breve", nada de tela quebrada.** Recurso Pro no grátis = preview
   real borrado + benefício em 1 linha + CTA (padrão `<GatePro>` da Onda 1).

Justificativa em uma frase: o grátis prova valor completo (mestre satisfeito) e a
marca no PDF cria a pressão social que faz assinar (dono satisfeito) — o modelo
Canva/Typeform/Loom, comprovado em SaaS prosumer.

## Matriz de entitlements

`null` = ilimitado/sem restrição. Valores são o CONTRATO; implementação abaixo.

| Chave | grátis | pro | empresa |
| --- | --- | --- | --- |
| `quotes.monthly_limit` | null | null | null |
| `quotes.remove_olli_brand` | **false** | true | true |
| `quotes.templates` | `['editorial']` | todos | todos |
| `quotes.cover_photo` | true | true | true |
| `ai.monthly_credits` | **3** | null | null |
| `reports.enabled` | false | true | true |
| `reports.advanced` (funil, margem, por funcionário) | false | false | true |
| `goals.enabled` (metas) | false | true | true |
| `radar.limit` (clientes sumidos visíveis) | **1** | null | null |
| `daily_report.enabled` (relatório do dia falado) | false | true | true |
| `team.max_members` | 1 | 1 | **10** |
| `team.live_location` | false | false | true |
| `team.access_log` | false | false | true |
| `dashboard.empresa` | false | false | true |
| `backup.retention_days` | 7 | 90 | 365 |
| `storage.limit_mb` (fotos/logo, quando Storage entrar) | 200 | 2048 | 10240 |
| `branches.max` (futuro) | 0 | 0 | 1 |
| `custom_roles.enabled` (futuro) | false | false | false |
| `automations.monthly_limit` (futuro) | 0 | 20 | null |
| `support.priority` | false | true | true |

`team.max_members = 10` no Empresa é limite SOFT: ao bater, CTA de contato
WhatsApp (não bloqueio duro) — enterprise se negocia, não se rejeita.

## Implementação (evolução, não reescrita)

Em `src/services/planos.ts`:

```ts
export interface Entitlements {
  'quotes.monthly_limit': number | null;
  'quotes.remove_olli_brand': boolean;
  'quotes.templates': ReadonlyArray<ModeloPdf> | null; // null = todos
  'ai.monthly_credits': number | null;
  'reports.enabled': boolean;
  'reports.advanced': boolean;
  'goals.enabled': boolean;
  'radar.limit': number | null;
  'daily_report.enabled': boolean;
  'team.max_members': number;
  'team.live_location': boolean;
  'team.access_log': boolean;
  'dashboard.empresa': boolean;
  'backup.retention_days': number;
  'storage.limit_mb': number;
}
export const PLANO_ENTITLEMENTS: Record<PlanoId, Entitlements> = { /* matriz acima */ };
export function getEntitlement<K extends keyof Entitlements>(plano: PlanoId, chave: K): Entitlements[K];
```

Regras de migração:
- `usePlano().temAcesso(recurso)` vira açúcar sobre chaves booleanas — os call
  sites de `<GatePro>` NÃO mudam. Mapear: `ia_ilimitada → ai.monthly_credits === null`,
  `relatorios → reports.enabled`, `equipe → team.max_members > 1`, etc.
- Depois da troca, `RECURSOS_POR_PLANO`/`Recurso` são apagados (não manter dois
  sistemas). Um commit, typecheck limpo.
- Chave desconhecida/plano desconhecido → **nega/menor valor** (mesmo princípio
  do `temAcessoRecurso` atual).
- Contadores (IA, radar) continuam locais por ora; quando a Onda de e-mail/portal
  trouxer mais servidor, mover contagem de IA para o worker (anti-abuso).
- O plano Empresa vem da MESMA fonte (webhook Stripe). `useTipoConta` (org) decide
  UI; entitlements decidem ACESSO. Não misturar: um usuário pode ter org e plano
  grátis (convidado por empresa) — o acesso da equipe deriva do plano do OWNER da org.

## Preços (vigentes)

| Plano | Mensal | Anual | 12x |
| --- | --- | --- | --- |
| Pro | R$ 39 | R$ 374 (−20%) | 12× R$ 39 (mode=payment, acesso 12 meses) |
| Empresa | R$ 99 (confirmar com o dono antes do live) | R$ 950 (−20%) | — |
