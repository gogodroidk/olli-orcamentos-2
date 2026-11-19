# Indicação e cupom — a regra em palavras simples

> Página da regra para o prestador e para a equipe. **Nada disto está no ar:** a indicação e o cupom nascem DESLIGADOS por flag e só ligam pelo roteiro (migration aplicada, política de privacidade publicada, termo na tela, revisão do LIVRE). Valores e limites não são digitados aqui nem na tela: vêm de `src/services/limitesComerciais.ts`.

## 1. O que o prestador lê

### Indicação — "colega indica colega"
- **Quem ganha o quê:** você manda seu link para um colega que também faz orçamento. Quando ele se cadastra pelo seu link **e envia o primeiro orçamento de verdade**, **vocês dois ganham 1 mês de Pro**.
- **Quando:** só depois do orçamento enviado, com o e-mail dos dois confirmado. Cadastro sozinho não vale.
- **Limites:** até 3 indicações premiadas por pessoa; cada colega só pode ser indicado uma vez.
- **Quem já paga o Pro:** o mês de brinde não soma ao plano pago. Nesse caso só o colega ganha o mês, e o cartão avisa isso antes.
- **O mês não vale dinheiro** e não pode ser transferido.

### Cupom de influenciador
- **Quem ganha o quê:** quem usa um código de cupom paga **10% a menos na 1ª cobrança** do plano (Pix ou cartão). O valor com desconto aparece **escrito na tela antes de pagar**: "De R$ X por R$ Y; nas próximas, o valor volta ao normal."
- **Quando:** só na **primeira** cobrança. Não vale retroativo: quem já pagou um plano não pode usar o cupom para pedir desconto no que já pagou.
- **Um cupom por conta**, com limite de usos e validade por código.
- **Cupom e indicação NÃO se somam:** vale o que a conta usar **primeiro**. A tela diz isso antes de aplicar. Quem entrou por link de indicação fica com a indicação; quem já usou um cupom pago não recebe o mês da indicação.

### Quadro: quem pode o quê
| Situação da conta | Indicação (mês de Pro) | Cupom (desconto na 1ª cobrança) |
|---|---|---|
| Nova, entrou pelo link de um colega | Sim, depois do 1º orçamento enviado | Não (vale a indicação) |
| Nova, sem link, com código de cupom | Não se aplica | Sim, na 1ª cobrança |
| Indicou um colega e ainda não ganhou | Sim | Sim, se usar primeiro |
| Já ganhou o mês da indicação | — | Não |
| Já pagou um plano antes | Quem já paga não soma o mês | Não (só 1ª cobrança) |
| Já usou um cupom (pago) | Não recebe o mês | Não usa outro |

## 2. Como funciona por dentro (equipe)
- **Chaves (nascem desligadas):** `INDICACAO_RECOMPENSA_ATIVA='1'` (indicação) e `CUPOM_INFLUENCER_ATIVO='1'` (cupom), no worker. Qualquer outro valor = desligado.
- **Uma constante para cada regra:** `INDICACAO_MESES_PRO`, `INDICACAO_TETO_PREMIADAS`, `INDICACAO_TETO_DIARIO`, `CUPOM_PERCENTUAL`, `CUPOM_USOS_MAX`, `CUPOM_VALIDADE_DIAS_MAX` em `src/services/limitesComerciais.ts` (o worker espelha, o SQL recebe por parâmetro, há teste de paridade).
- **Sem preço novo:** o valor com desconto sai do preço de tabela × (100 − %). Pix (AbacatePay) cobra o valor com desconto e só libera se a cobrança foi criada com cupom (o webhook confere o valor); cartão (Stripe) usa um cupom da Stripe de uso único, só na 1ª cobrança, sem o campo de promotion code junto. Pix do Mercado Pago segue a mesma regra (piso de 50% como trava).
- **Atribuição por origem:** guarda só **código + conta** (+ plano, canal, data). Nenhum nome, e-mail ou contato do influenciador. O admin lista por código: reservados e pagos.
- **Admin (só administrador com 2º fator):** `GET /admin/api/cupons`, `POST /admin/api/cupons/criar` (código, limite de usos até 500, validade até 90 dias, motivo) e `POST /admin/api/cupons/desativar`. Toda mudança é auditada antes de gravar. A tela do painel para isso é a próxima etapa; hoje é pela API.
- **Reserva e uso:** o desconto é reservado ao gerar o Pix/checkout (vaga presa por 24h) e vira "uso" só quando o pagamento é confirmado. Recusa (esgotado, expirado, já usou, já pagou, indicação) **nunca** cobra o valor cheio escondido: o servidor não gera a cobrança e a tela diz o motivo.
- **Não coberto agora:** Pix Automático (assinatura recorrente) e Apple/Google (a loja define o preço). O cupom é para Pix avulso e cartão.

## 3. Para ligar (nesta ordem, tudo pelo roteiro)
1. Migrations `20261010100000_indicacoes.sql` e `20261119090000_cupom_influenciador.sql` em staging, depois produção.
2. Política de privacidade: parágrafos de `docs/INDICACAO_POLITICA_PRIVACIDADE_patch.md`.
3. Revisão do LIVRE — Revisor no PR.
4. Criar os códigos no admin (limite de usos e validade por código) e só então ligar as flags.
