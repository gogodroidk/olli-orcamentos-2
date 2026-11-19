# Patch da política de privacidade — programa de indicação (para aplicar SÓ junto com a flag)

> Parágrafo para a seção "Dados que coletamos / Indicação de colegas" da política. Texto proposto; publicar só quando a recompensa for ligada.

**Indicação de colegas.** Se você chegou ao OLLI pelo link de um colega, guardamos o vínculo entre a sua conta e a conta de quem indicou (o código usado e as datas do cadastro e do primeiro orçamento enviado). Usamos essa informação apenas para conceder o benefício do programa (1 mês de Pro para quem indicou e para quem foi indicado, quando o indicado envia o primeiro orçamento) e para evitar fraude. Quem indicou vê apenas quantas indicações já foram premiadas, nunca o seu nome, e-mail ou dados de uso. O benefício é de uso do serviço: não vale dinheiro e não pode ser transferido. Base legal: execução do programa que você aceitou ao se cadastrar pelo link e legítimo interesse na prevenção a fraudes (LGPD, art. 7º, V e IX). Você pode pedir a exclusão desses dados ou parar de receber mensagens sobre o programa a qualquer momento (LGPD, art. 18) pelo contato do suporte do OLLI.

## Termo curto na tela (antes de ligar)
"Indique um colega e vocês dois ganham 1 mês de Pro quando ele se cadastrar pelo seu link e enviar o primeiro orçamento de verdade. Até {TETO} indicações premiadas por pessoa. Quem já paga o Pro não soma o mês ao plano. O mês não vale dinheiro e não pode ser transferido. Guardamos quem indicou para conceder o mês; veja a Política de Privacidade." ({TETO} e o valor vêm de `limitesComerciais.ts`.)

## Cupom de influenciador (parágrafo extra — publicar SÓ junto com a flag CUPOM_INFLUENCER_ATIVO)
**Cupom de desconto.** Se você usar um código de cupom, guardamos o código usado, o plano escolhido, a forma de pagamento (Pix ou cartão) e a data, ligados à sua conta. Usamos isso para aplicar o desconto na primeira cobrança, respeitar o limite de usos do código e saber qual parceria trouxe cada venda. O parceiro que divulgou o código não recebe o seu nome, e-mail ou dados de uso: guardamos só o código, nunca dados pessoais de quem o divulga. Base legal: execução do serviço que você contratou e legítimo interesse (LGPD, art. 7º, V e IX). Você pode pedir a exclusão desses dados a qualquer momento (LGPD, art. 18) pelo contato do suporte do OLLI.

## Termo curto na tela do cupom
O campo de cupom já mostra, antes de aplicar: "Cupom e indicação não se somam: vale o que você usar primeiro nesta conta." e "O cupom vale só na 1ª cobrança e não vale para o que você já pagou." (textos em `src/utils/cupomTexto.ts`).
