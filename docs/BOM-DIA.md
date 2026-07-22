# Bom dia, Igor — o que aconteceu enquanto você dormia

> Escrito em 21/07/2026, madrugada. Tudo aqui foi verificado por comando, e onde
> não deu para verificar, está escrito que não deu.

---

## Em uma linha

O código está redondo e no ar. Sobraram **3 coisas que só você pode fazer** — todas
de minutos, nenhuma de engenharia.

O 4º item desta lista (o segredo do Mercado Pago) **saiu**: foi medido em 21/07 e não
é bloqueio. Ver a seção 2.

---

## O que fazer hoje, em ordem

### 1. Revisar o PR (10 min)

**https://github.com/gogodroidk/olli-orcamentos-2/pull/38**

58 commits, 419 arquivos. A descrição conta o que quebrou e o que foi construído.
Você não precisa ler o diff inteiro — leia a descrição e decida se faz o merge.

⚠ **Não faça merge de tudo de uma vez sem pensar.** Se algo quebrar em produção,
você não vai saber qual dos 58 commits foi. Se preferir, mergeie e fique de olho
por um dia; o rollback é `git revert` do merge.

### 2. Webhook do Mercado Pago — JÁ FUNCIONA (medido em 21/07)

> **Correção.** Este item dizia "sem o `MP_WEBHOOK_SECRET` o Pix inicia a cobrança e
> nunca confirma", e mandava cadastrar a URL no painel. **As duas coisas estavam
> erradas**: o segredo não é requisito de funcionamento, e o cadastro já tinha sido
> feito numa sessão anterior. Escrito de memória em vez de medido — o erro que a regra
> "copy derivada da fonte" existe para matar.

**Medido em produção com dois pagamentos de R$ 0,01, criados e cancelados sem pagar:**

| | Pix normal (o que o app cria) | Controle, sem `notification_url` |
|---|---|---|
| entregas em `/mp/webhook` | 4 | 2 |
| resposta do worker | `200` em todas | `200` em todas |

O controle mostra quem faz o quê: as entregas continuam chegando mesmo **sem** o campo
`notification_url`, ou seja, quem avisa é o **cadastro no painel** — que já existe. O
campo que o worker manda em cada pagamento
([mercadopago.js:232](../worker/src/mercadopago.js#L232)) acrescenta uma segunda
entrega, no formato antigo. **Dois caminhos ativos, redundantes.** Não há nada a
configurar.

Sobre o segredo: sem ele o worker confirma cada notificação perguntando ao próprio MP
(`GET /v1/payments/<id>`) — é essa consulta que autoriza o crédito, e ela não dá para
forjar. Com ele, entra **antes** uma checagem de assinatura HMAC que barra tráfego
estranho na borda. Segurança a mais, não funcionamento. O `x-signature` veio presente
em todas as 6 entregas, então no dia que você colar o segredo a camada liga sozinha.

**O que ainda não foi exercido:** um pagamento **aprovado** virando saldo. Exige
dinheiro real trocando de mão — R$ 0,01 pago do seu celular fecha, ou o primeiro
cliente. Todo o resto do caminho já rodou em produção.

### 3. Assinar o APK para a loja

O APK está pronto em `C:\olli\android\app\build\outputs\apk\release\app-release.apk`
(~127 MB) — mas assinado com **chave de debug**. Ele instala e testa no seu celular
agora; **não** serve para publicar.

Para publicar você precisa da senha da keystore de upload
(`CONFIG CLAUDE\olli-keystore\olli-upload.jks`). A checklist completa da Play está em
`docs/ENXAME/LOJA.md` — as 8 capturas de tela já estão prontas em `assets/loja/`,
no formato que o Google exige (1080×1920, sem alpha, conferido).

### 4. Apple — um prazo já venceu

O aceite do **Developer Program License Agreement** vencia em 06/07 e passou. Sem
ele, o regime brasileiro nem está destravado na sua conta. Confira em
App Store Connect → Business. Detalhe em `docs/ENXAME/LOJA_IOS.md`.

---

## O que está no ar agora

| | Estado |
|---|---|
| **Landing** | produção — blog, telas reais do app, página `/planos` com mensal/anual |
| **Painel** | produção — planos, acessibilidade, −18% de peso no primeiro carregamento |
| **Worker** | produção — cartão só Stripe, Pix só Mercado Pago (provado rota por rota) |
| **Banco** | 6 migrations aplicadas |
| **APK** | compilado com tudo dentro |
| **Gate** | preflight exit 0 · 29 suítes · 0 falhas |

---

## O que consertei que estava quebrado de verdade

**Dinheiro e dado de cliente:**
- O backup do técnico levava a base inteira do dono — ele saía da empresa com a sua
  carteira de clientes.
- Qualquer pessoa autenticada podia inserir o `uid` de outra como membro da própria
  organização; no sync seguinte, o aparelho da vítima reescrevia a base dela dentro
  do tenant do atacante. Ela não perdia cópia — perdia a posse.
- A cobrança de IA era opt-in do cliente: quem omitisse um campo usava Gemini
  ilimitado na sua conta.
- Quem já tinha Pro pago por Pix **perdia o plano só de tocar em "assinar"**, sem
  ter pago nada. Esse bug morreu junto com a rota de cartão do Mercado Pago.

**Coisas que você via e não sabia nomear:**
- O ícone na barra de tarefas era o **logo do Astro** — a marca de outro produto.
- Texto invisível no login em tema escuro (1,11:1, preto sobre navy).
- A prévia de impressão em branco na primeira vez.
- Todas as animações da landing estavam mortas por um `overflow-x: hidden`.

---

## Três coisas da pesquisa que mudam decisão

1. **A data da NFS-e estava errada nos meus próprios documentos.** Eles diziam que o
   público inteiro vira obrigado em 01/09/2026. O **MEI está obrigado desde
   01/09/2023** — e MEI é a maioria esmagadora do seu público. Dizer a um MEI "você
   será obrigado em setembro" erra o fato e perde a venda: ele já sente a dor hoje.
   Não chegou a nenhuma copy pública. Detalhe em `docs/ENXAME/ALERTA_NFSE_DATA.md`.

2. **Seu repositório é público — e não há vazamento.** Fui ao histórico procurar: o
   único JWT commitado é a chave `anon`, que é pública por desenho e protegida por
   RLS. Zero `sk_live`, zero token do Mercado Pago, zero `service_role`.

3. **A landing promete "sincroniza quando a rede volta" e isso só é verdade se o app
   for reaberto.** Não há fila de saída nem listener de estado do app. Ou a promessa
   muda, ou a fila é construída (~200 linhas, sem dependência nova).

E três que **não** valem a pena, com o motivo em `docs/ENXAME/OPORTUNIDADES.md`:
trocar a engine de sincronização, emitir nota fiscal de verdade agora (R$ 548/mês
fixos contra R$ 0 de receita) e clima pago.

---

## O que eu não consigo fazer, e não é falta de esforço

Não digito senha em formulário, não crio conta em seu nome e não aceito contrato
jurídico por você. É por isso que os 4 itens acima são seus — e é por isso que
"100% pronto" tem esse limite: tudo construído, testado e no ar, com uma lista
curta de cliques.

---

## E a coisa desconfortável, que repito porque é a que importa

O sistema tem **329 leads de teste, 0 pagantes e 0 lançamentos no ledger**. A máquina
de cobrança está ligada, correta e **nunca foi exercida**.

O gargalo nunca foi engenharia. São os 5 minutos do item 2 acima — e depois,
**três prestadores de verdade com o app instalado na mão**. Esse terceiro passo não
depende de nada: pode ser feito hoje, mesmo antes do webhook.

Produto a 90% em zero celulares vale zero. Produto com 3 usuários reais te ensina em
uma semana o que 50 ondas de agentes não descobrem.
