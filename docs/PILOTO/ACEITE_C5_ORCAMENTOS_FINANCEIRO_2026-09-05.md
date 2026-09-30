# Aceite local C5 — orçamentos, estados e financeiro operacional

Data: **2026-09-06** (revalidação)  
Checkout canônico: `C:\OLLI_REL`  
Branch: `Codex/piloto-p0`

## Resultado

O ciclo comercial está representado sem destruir histórico:

- o editor trabalha sobre o blob completo do orçamento;
- depois de enviado, editar cria uma revisão/rascunho; duplicar também cria um
  novo documento, sem sobrescrever o que o cliente já recebeu;
- a exclusão é soft delete e avisa quando o documento já saiu;
- o Quadro agrupa rascunho, enviado, negociação, aprovado e perdido, mantendo
  `convertido` visível dentro de Aprovado e status desconhecido em Outros;
- pagamento é comprovado pelo recibo e pela data de recebimento; `convertido`
  representa o fechamento operacional/serviço concluído, sem inventar uma nova
  coluna de cobrança fora do domínio existente;
- a tela Início exibe em jogo, a receber, recebido no mês, taxa de aprovação,
  dinheiro parado e clientes esfriando, com links para ação;
- falha de leitura financeira aparece como erro + retry, nunca como saldo zero
  silencioso.
- o seletor de orçamento do formulário de recibo usa o mesmo hook paginado das
  listas do painel e só consulta quando o formulário está aberto; assim, o cap
  de aproximadamente 1.000 linhas do PostgREST não oculta histórico nem gera
  uma leitura pesada ao entrar em `/recibos`.

## Evidências locais

- `npm run test:c5-orcamentos-financeiro` — passou.
- `npm run typecheck` — passou após a revalidação da paginação do seletor de
  recibos.
- `npm run build` em `web` — passou.
- O quadro e o painel usam os tipos/status do domínio e as funções puras de
  `webapp/src/pages/olli/inicio/financeiro.ts`.

## Limites da prova

Ainda não houve teste com dados de cliente em ambiente de staging, anexação de
comprovante em armazenamento remoto ou validação de conciliação bancária. Essas
integrações ficam no pacote C7 e exigem consentimento, credenciais e ambiente
externo; não são simuladas como concluídas aqui.
