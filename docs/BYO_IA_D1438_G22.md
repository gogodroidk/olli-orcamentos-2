# Conectar IAs (BYO) — D-1438 G22

Spec para construir depois. Este item não liga o plugue, não cobra e não muda o preço publicado.

- Pro continua R$ 39 por mês.
- Empresa continua R$ 99 por mês.
- Cobrança nova de IA dentro da plataforma: **BLOQUEADO** até o Igor definir o preço, o que já entra no plano e se a venda aparece na loja do celular.

Fonte do pedido: áudio do Igor em 27/10/2026, item "Conectar IAs (BYO)" em `SPEC.md` do walkthrough. A ordem de 03/11 manda executar. A caixa deste item é só a spec. A revenda de token fica parada.

Código que trava a regra, sem rede e sem segredo: `src/services/byoIa.ts`. Teste: `node scripts/teste-byo-ia.ts`.

## O que o Igor pediu, separado em duas coisas

A frase junta dois produtos.

1. **Plugar.** O prestador liga Claude, GPT ou Gemini por API, MCP ou plugin. A maioria já usa o ChatGPT e, com o OLLI dentro desse chat, usa mais o OLLI.
2. **Pagar dentro da plataforma.** O dinheiro da IA passa pelo OLLI.

O item 1 dá para especificar agora. O item 2 é preço novo. Sem o número e sem o que ele inclui, uma tela de compra mente (CDC, art. 37) ou cobra duas vezes quem já paga Pro ou Empresa.

## O que já existe e não se mexe

A IA da casa continua como está.

| Peça | Onde | O que faz hoje |
|---|---|---|
| Porta da IA | `src/services/ports/AiProvider.ts` | A tela não fala com o modelo. Quem chama é o worker. |
| Provedor | `worker/src/ai.js` | OpenRouter na frente. Gemini só se `AI_PROVIDER=gemini`. Workers AI transcreve áudio. A chave mora no worker, nunca no app. |
| Cota | `worker/src/creditos.js` | Grátis: 3 usos de IA por mês (`IA_GRATIS_MES`). Pro e Empresa: `ia_ilimitada`, não debitam crédito na voz, no chat e no diagnóstico da casa. |
| Plano | `src/services/entitlements.ts` | `ia_ilimitada` já é recurso do Pro e da Empresa. |
| Preço | `src/services/precosPlanos.ts` e o gêmeo `web/src/data/planos.ts` | Fonte única. 3900 e 9900 centavos. |
| Privacidade | `src/content/legal/privacidade.ts`, seção 4 | Diz que a chave é nossa, no servidor, e que os modelos são os que nós escolhemos (OpenRouter para OpenAI e Mistral). Isso continua verdade enquanto o BYO estiver desligado. |
| Ledger | `public.credit_ledger` | Crédito interno. Pacotes antigos no código do Mercado Pago e no rascunho do AbacatePay **não estão na tela**. Este item não escolhe valor e não liga pacote. |
| Aba Integrações | PR do G14, ainda fora da main (`webapp/src/pages/olli/integracoes/catalogo.ts`, id `chave-ia`) | Texto honesto: a tela não pede chave. Quando esse PR entrar, a linha fica. Esta spec não a troca por um formulário. |

Autopilot, precificação com IA e a cara de chat são outros itens do mesmo áudio. Não entram aqui.

## Três modos

O contrato está em `MODOS_BYO`.

### API — a minoria que tem chave de desenvolvedor

O prestador cola a chave criada no console do provedor. O worker chama o modelo com essa chave. A fatura sai no provedor, na conta dele.

Fato que muda o desenho: assinatura de chat e chave de API são contas diferentes. ChatGPT Plus não inclui crédito de API (OpenAI Platform, página de chave, conferido em fonte de 30/10/2026). Claude Pro também não inclui a API do console; a fatura da API é à parte. Quem "já usa ChatGPT" em geral **não tem** chave `sk-`. Pedir a chave como caminho principal trava a maioria e ainda empurra a pessoa a comprar crédito no provedor sem a gente explicar.

Por isso a API é o segundo caminho, para quem já tem chave. Não é o que aumenta o uso de quem só tem o aplicativo do ChatGPT.

Regras da chave, já no código:

- O campo é só a chave. Espaço e quebra de linha no meio somem antes de classificar (a pessoa cola com quebra).
- Claude: começa com `sk-ant-`.
- GPT: começa com `sk-proj-` ou `sk-`.
- Gemini: começa com `AIza`.
- Mínimo de 20 caracteres. Prefixo sozinho recusa.
- `sk-or-v1-` é chave da casa (OpenRouter). Recusa com `chave_da_casa`. O prestador não cola a nossa chave, e a nossa chave não vira "chave dele".
- `sb_secret_`, `sk_live_`, `sk_test_`, `rk_live_`, `rk_test_` recusam com `nao_e_chave_de_ia`.
- `classificarChave` devolve provedor e os 4 últimos caracteres. Não devolve a chave.
- `redigirTexto` troca o miolo por `[chave]` antes de log, erro ou analytics. Vale para a chave da casa mesmo com `_` ou `-` no corpo, e também para `sk_live_`, `sk_test_`, `rk_live_` e `rk_test_`, que o classificador recusa.
- Este item não chama o provedor para "ver se a chave vale". Essa chamada gasta o crédito dele ou o nosso. Fica para a construção, no worker, com timeout, sem gravar o corpo da resposta.

Onde a chave mora, quando for construída (não agora):

- Não entra no SQLite do app. O sync mandaria o segredo para a nuvem em claro.
- Não entra no `localStorage` do painel.
- Não entra em backup de texto, Sentry, PostHog nem log do worker.
- O worker recebe por HTTPS, cifra com segredo que só o worker tem, e guarda o ciphertext mais os 4 últimos. O cliente lê status e os 4 últimos. O ciphertext não sai na API do prestador.
- Apagar a conta apaga a linha. Trocar a chave apaga o ciphertext anterior.
- Não há arquivo `.sql` em `supabase/migrations` neste PR. Um arquivo lá entra na janela de migration. O esboço está mais abaixo, marcado para não aplicar.

### MCP — o caminho de quem já usa o chat

A OLLI vira um servidor MCP remoto. O prestador adiciona esse servidor no Claude, no ChatGPT ou no Gemini que ele já paga. A IA dele chama ferramenta da OLLI com a sessão dele. A OLLI não vê a chave do modelo. Não há o que revender nesse modo: o token é pago por ele, direto no produto que ele já tem.

O que dá para afirmar com fonte:

- Claude, help center oficial, artigo de conectores remotos, atualizado em 30/10/2026: conector MCP remoto existe no Claude, no Cowork e no Claude Desktop. Plano Free fica em um conector. Pro, Max, Ultra, Team e Enterprise também conectam. Autenticação recomendada: OAuth por pessoa. Credencial estática (uma chave para a organização inteira) está em beta e dá o mesmo acesso a todo mundo que usa o conector. Fonte: `https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp` e `https://claude.com/docs/connectors/building/authentication` (31/10/2026).
- ChatGPT, em outubro de 2026: o menu já se chamou connectors, apps e plugins. Guias da época descrevem Plugins, adicionar servidor MCP, URL HTTPS. Quais planos mostram o botão muda, e a página que um guia cita não é a mesma que outro guia cita. A spec não promete que o ChatGPT Free ou Plus do prestador tenha o botão. Na hora de construir, abrir a documentação atual da OpenAI e escrever na tela o que ela disser, inclusive "o seu plano do ChatGPT pode não mostrar este conector".
- Gemini: o app de consumidor, em fonte secundária de novembro de 2026, limita app MCP (conta pessoal, país, idade). O Gemini CLI é ferramenta de desenvolvedor, não o caminho do prestador na rua. Não prometemos o app Gemini do celular.

Consequência honesta: dá para construir o servidor. Não dá para prometer que todo mundo que "já usa ChatGPT" vê o botão hoje. A tela diz isso. Quem não vê o botão continua com a IA da casa, que já está no plano.

Regras do servidor, para a construção futura:

- Uma rota nova no worker que já existe. Sem deploy neste item. Sem URL pública anunciada.
- Login de cada prestador, com a sessão que o OLLI já tem. Sem chave compartilhada da equipe. Funcionário vê só o que o papel dele já vê.
- Ferramenta de escrita (criar orçamento, mexer em cliente) grava rascunho e pede confirmação no OLLI, no mesmo espírito do autopilot. Sem confirmação, nada muda no cadastro.
- Ferramenta nenhuma manda WhatsApp, e-mail ou cobrança ao cliente do prestador.
- O texto do orçamento pode ter nome e telefone do cliente do prestador. Quem controla esse dado é o prestador. O OLLI opera. O provedor do modelo, no modo MCP, recebe o texto porque o prestador pediu ao chat dele. A tela, antes de ligar, diz para qual produto o texto vai.
- Isolamento: a ferramenta só lê a conta de quem autorizou. ID de outra conta não é parâmetro aceito.

### Plugin — o mesmo MCP, outro nome

No vocabulário do Igor, plugin é o conector aberto de dentro do Claude, do ChatGPT ou do Gemini. Em 2026 esse conector fala MCP. O plugin antigo do ChatGPT (2023) saiu de linha. Não vamos construir aquele formato.

`PLUGIN_USA_MCP` é `true`. Não há terceiro protocolo, terceira chave nem terceira cobrança.

## Cobrança dentro da plataforma — BLOQUEADO

`COBRANCA_IA_NA_PLATAFORMA.estado` é `bloqueada`. `exigirSemCobrancaNova` estoura se alguém passar `liberada`. O teste chama os dois.

Três leituras possíveis da frase do Igor. Só a primeira está fechada. A segunda e a terceira esperam ele.

1. **Já pago no plano.** Pro R$ 39 e Empresa R$ 99 já incluem `ia_ilimitada` da IA da casa, e o Pix/cartão já acontece na plataforma. O plugue BYO não cria preço. Quem usa a própria chave ou o próprio chat paga o provedor, fora do OLLI. Esta é a leitura com a qual a spec segue, porque não inventa número.
2. **Revender token.** O OLLI compra inferência e vende crédito além do plano. Isso é preço novo. Falta o Igor dizer, por escrito: o valor em centavos, se o Pro e a Empresa continuam com a IA da casa sem débito, se os 3 usos do grátis continuam, o que acontece no estorno e quem emite a nota. Pacote antigo que está só no código não vale como resposta.
3. **Taxa em cima da chave dele.** No modo API a fatura do token já é do provedor. Cobrar de novo o mesmo uso no OLLI é cobrança em dobro. Uma taxa de plataforma, se um dia existir, é a decisão 2, não um detalhe de engenharia.

Enquanto a decisão 2 não existir:

- Não cria Price na Stripe, produto no Play, produto na Apple nem checkout AbacatePay ou Mercado Pago.
- Não muda `precosPlanos.ts` nem `web/src/data/planos.ts`.
- Não coloca pacote de crédito na tela.
- Não escreve "pague a IA aqui", "créditos de IA" nem outro valor que não seja o Pro e a Empresa já publicados.
- Vender bem digital dentro do app iOS, se um dia a decisão 2 for sim, esbarra no regime brasileiro da Apple de 18/06/2026 e 18/07/2026 (`docs/ENXAME/VEREDITO_APPLE_IAP.md`): a compra no app continua na mesa, com comissão. Android segue o Play Billing já documentado. Isso é motivo a mais para não improvisar checkout.

A IA da casa, para quem não pluga nada, segue coberta pelo plano atual. Esse é o jeito de "pagar dentro da plataforma" que já está no ar, sem preço novo.

## Texto de tela

Quando houver tela, ela usa `textoDoModo`. Hoje o texto diz que o campo e o conector ainda não existem. Resumo:

- API: a fatura sai no provedor, não no OLLI. O plano publicado segue Pro R$ 39 e Empresa R$ 99. Ainda não há campo de chave.
- MCP: liga o chat que a pessoa já usa. A OLLI não vê a chave do modelo. Mesmo plano. Ainda não há conector.
- Plugin: é o mesmo conector, aberto de dentro do aplicativo do modelo.

A resposta da IA, da casa ou plugada, continua apoio. A decisão técnica é do prestador. Não prometemos ilimitado no modelo dele.

## LGPD e CDC, na hora de ligar (não antes)

Não atualizar a política agora. A seção 4 está certa para a IA da casa. Anunciar BYO no jurídico antes do plugue existir descreve um fluxo que não há.

No mesmo PR que ligar o plugue, antes do flag subir:

- Dizer, na tela e na política, que o prestador escolheu o provedor e que o texto necessário (pode incluir dado do cliente dele) segue para esse provedor.
- A OLLI não promete que o provedor dele deixe de treinar. Quem garante isso é o contrato dele com o provedor. A IA da casa continua com a regra atual de não treinar, porque o provedor é o nosso.
- Base: o prestador é o controlador do dado do cliente dele; o OLLI opera a pedido dele. Sem o aviso antes do botão, o fluxo não liga.
- Exclusão de conta apaga ciphertext e os 4 últimos.
- O botão "Sinalizar", que já existe na IA da casa, vale também para resposta vinda do modelo plugado.
- Nada de chave em log. `redigirTexto` na borda do worker.

## O que construir, e em que ordem, quando o Igor destravar

Não fazer nesta branch.

1. Igor responde, numa linha: a leitura 1 basta, ou a leitura 2 tem valor, inclusão no plano e canal (site, Android, iOS).
2. Se for só a leitura 1: servidor MCP no worker, flag desligada, OAuth da sessão já existente, ferramenta de leitura da própria conta, escrita só com confirmação. Sem migration aplicada até a janela. Sem deploy até a janela.
3. Modo API na sequência, com a cifra e `classificarChave` / `redigirTexto`. A tela não oferece os dois botões como se fossem a mesma coisa: um gasta a chave dele, o outro usa o chat dele.
4. A linha `chave-ia` do G14 só perde o "em breve" quando o modo correspondente realmente liga.
5. Leitura 2, se ele disser sim: outro PR, com o preço na fonte única, o jurídico e a loja. Esse PR não começa sem o número.

## Esboço de tabela — não aplicar

Não há arquivo em `supabase/migrations`. Copiar isto para lá sem a janela e sem a decisão liga armazenamento de segredo cedo demais.

```sql
-- NÃO APLICAR. Esboço do G22, só depois da decisão do Igor e da janela de migration.
-- O ciphertext não é legível pela API do prestador. RLS de select devolve status e ultimos4, nunca o segredo.

create table public.ia_conexao_prestador (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provedor text not null check (provedor in ('claude', 'gpt', 'gemini')),
  modo text not null check (modo in ('api', 'mcp', 'plugin')),
  ultimos4 text,
  ciphertext bytea,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz
);
```

Modo `mcp` e `plugin` ficam com `ciphertext` nulo: não existe chave de modelo para guardar. Quem autoriza é a sessão.

## Reuso

Três caminhos olhados antes de escrever:

- MCP, padrão aberto que o Claude documenta como conector remoto. Serve para os três nomes que o Igor falou (API à parte, MCP, plugin) sem copiar o plugin morto de 2023.
- Cofre no worker, que a IA da casa já usa: segredo fora do app. A chave do prestador, se um dia existir, segue o mesmo lugar, cifrada, nunca o mesmo segredo da casa.
- LiteLLM ficou de fora. `docs/INTEGRATION_BACKLOG.md` já decidiu que a porta `AiProvider` basta até haver mais de um provedor nosso em produção. BYO, quando existir, entra atrás dessa porta.

## Fora deste item

E-mail do cliente, senha antiga, código por e-mail, espaço lateral, Kanban para Finalizado, PDF em duas telas, autopilot, precificação com IA, deploy, merge, migration aplicada, Auth, Supabase, Cloudflare, DNS, ollizap.online, anúncio, mensagem a cliente, conta nova, gasto.

## Pronto quando

- A spec e `byoIa.ts` estão na branch, com o teste na cadeia do `npm test`.
- `pode` cobrar continua falso: `exigirSemCobrancaNova('liberada')` estoura, e o estado de produção é `bloqueada`.
- Nenhum arquivo de `src/`, `worker/` ou `webapp/` importa `byoIa`.
- Preço da fonte segue 3900 e 9900 centavos.
- Não há migration nova, deploy nem preço novo na tela.
