# Precificação com IA (D-1438) — desenho do protótipo

A Central de Precificação continua dona do número. A IA só lê o texto do prestador e devolve os campos que ele mesmo informou. O preço sugerido sai de `calcularPrecoServico` / `calcularPrecoProduto`, a mesma conta de hoje.

## O que a IA faz e o que ela não faz

Faz: separar modo (serviço ou produto), nome e os custos que estão escritos (hora, materiais, deslocamento, compra, frete, embalagem, impostos, taxa, reserva, margem). Diz o que faltou.

Não faz: pesquisar preço da cidade, copiar concorrente, chutar hora técnica, devolver "preço justo", garantir margem, gravar o catálogo, enviar orçamento ou esconder custo do cliente. Pedido para inventar número ou enganar o cliente volta vazio, com um aviso.

Campo ausente fica vazio (`-1` no modelo, `null` depois da normalização). Zero só entra se a pessoa escreveu zero. Número fora da faixa é ignorado. Preço de venda que o modelo tente enfiar é descartado: o schema não tem esse campo.

## Onde roda

- Painel: card "Rascunho com IA" na Central de Precificação, só se `VITE_PRECIFICACAO_IA` for exatamente `on`.
- Worker: `POST /ia/precificacao/rascunho`, só se `PRECIFICACAO_IA` for exatamente `on`. Sem a flag a rota responde 404, antes da tabela de métodos, e não chama provedor nem cota.
- Provedor: `gerarIA`, o mesmo adaptador do chat, da voz e do Autopilot. Sem modelo novo, sem chave nova, sem fornecedor novo.
- Cota: a mesma pré-autorização e a mesma cobrança de crédito do chat (`preautorizarUsoIa` + `cobrarCreditoVoz`). A cota grátis entra primeiro. Crédito pago só com o botão "Usar um crédito e ler". Não abre cobrança nova.

As duas flags nascem desligadas. Este protótipo não muda `wrangler.jsonc`.

## Passos na tela

1. A pessoa descreve o serviço ou a peça, com os números que já sabe.
2. "Ler os números" manda o texto. A tela mostra o que foi lido, o que faltou e os avisos.
3. "Colocar na calculadora" copia só esses campos. O card da direita recalcula.
4. Salvar no catálogo continua sendo o botão que já existia, com o nome conferido pela pessoa.

Nada disso aparece para o cliente final.

## Como ligar depois (não faz parte deste protótipo)

1. No Worker, variável `PRECIFICACAO_IA` = `on`.
2. No build do painel, `VITE_PRECIFICACAO_IA` = `on`.
3. Deploy, que esta entrega não faz.

Sem os dois, a tela de sempre permanece e a rota nova não existe.

## Rollback

Reverter o commit desta branch. Não há migration, não há flag ligada e não há dado novo no banco.
