# Cupom de influenciador — como criar, acompanhar e desativar um código (pela API do admin)

> Procedimento de quem vai criar os códigos. Vale **até a tela do painel existir**. Cada comando abaixo é exercitado por `worker/scripts/teste-cupom-procedimento.js` (o teste lê este arquivo: se o texto e o código divergirem, ele falha). **Cupom e indicação nascem desligados**: criar código não liga nada; quem liga é a flag `CUPOM_INFLUENCER_ATIVO='1'`, só pelo roteiro.

## Antes de começar
- Perfil **administrador** com **2º fator ativo** (o painel pede AAL2). Sem isso a API responde 403.
- O percentual do desconto **não é escolhido aqui**: é a constante única `CUPOM_PERCENTUAL` (`src/services/limitesComerciais.ts`). O código só define **teto de usos** (1 a 500) e **validade** (1 a 90 dias).
- O código é só letras e números, de 4 a 20 caracteres (ex.: `ANA10`). Use um por parceiro; **não grave nome, e-mail nem contato do parceiro em lugar nenhum do sistema** (a atribuição guarda só código + conta).

## 1. Criar o código
`POST /admin/api/cupons/criar` (cabeçalho de sessão do painel; corpo JSON):
```json:criar
{ "codigo": "ANA10", "usosMax": 50, "validadeDias": 30, "motivo": "parceria do canal da Ana, campanha de novembro" }
```
Respostas: `200 {ok:true, codigo}`; `409 codigo_existe`; `400` com o campo inválido (`codigo_invalido`, `usos_invalido`, `validade_invalida`, `motivo_invalido`); `503 auditoria_indisponivel` (nada foi gravado) ou `cupom_sem_migration` (a migration ainda não foi aplicada).

## 2. Acompanhar (atribuição por código)
`GET /admin/api/cupons` → lista `{codigo, usos_max, valido_ate, ativo, reservados, pagos}`. É só contagem por código: nenhum dado pessoal. **reservados** = pessoas com o desconto aberto (24h); **pagos** = descontos já usados.

## 2b. Link do influenciador e de onde vieram os cadastros
- O link do parceiro é a página normal com `?cupom=CODIGO` (ex.: `https://olliorcamentos.online/?cupom=ANA10`). A landing guarda o código junto da origem do visitante (mesmo cookie `olli_attr`, 90 dias) e o repassa aos links para o painel; no cadastro ele vai em `user_metadata.origem_utm.primeiro_toque.cupom` (e `ultimo_toque`). **Gravar a origem não liga desconto nenhum** e não precisa do código existir na lista.
- `GET /admin/api/cupons/origem` (com `?codigo=ANA10`) → `{ok, codigo, cadastros, orcaram, pagaram}`: contas que chegaram pelo código (1º ou último toque), quantas enviaram ao menos 1 orçamento e quantas pagaram. Só contagem, sem dado pessoal; contas internas (lista de exclusões) e apagadas ficam de fora. `503` = não consegui ler (não é zero).
- Isto é independente do desconto: `reservados/pagos` da lista contam quem **usou** o desconto no checkout; `cadastros/orcaram/pagaram` contam quem **chegou** pelo link.

## 3. Desativar
`POST /admin/api/cupons/desativar`:
```json:desativar
{ "codigo": "ANA10", "motivo": "campanha encerrada" }
```
Quem já pagou com o código não é afetado; quem tinha o Pix aberto ainda paga o valor já gerado.

## 4. Desconto pago em duplicidade (se aparecer): a diferença é perda da OLLI, NUNCA estorno
Se duas cobranças com desconto forem pagas na mesma conta (corrida), o cliente recebeu os dois períodos pagando menos do que devia. **Quem perdeu foi a OLLI.** O sistema mantém a venda, **marca a diferença** e escreve um alarme no log; nunca fica silencioso.
- **Não estorne nada no gateway:** estorno vai para o cliente e dobraria a perda.
- Decisão da CPO, caso a caso: **registrar a perda** ou **cobrar a diferença do cliente, com aviso claro**.
- `GET /admin/api/cupons/diferencas` → cobrança, código, valor da diferença (centavos) e estado `pendente`.
- Depois de decidir e tratar, dê baixa (estado `resolvido`):
```json:resolver
{ "cobrancaId": "bill_123", "motivo": "perda registrada por decisão da CPO" }
```
`POST /admin/api/cupons/diferencas/resolver`.

## Conferência antes de divulgar um código (staging)
1. Criar o código (passo 1) e conferir na lista (passo 2): `ativo=true`, `reservados=0`, `pagos=0`.
2. Com a flag ligada **só no staging**, abrir o app na web com uma conta nova, aplicar o código, gerar o Pix e conferir que a tela mostra "De R$ X por R$ Y" **antes** de pagar.
3. Voltar à lista: `reservados=1`. Pagar (sandbox) e conferir `pagos=1`.
4. Pedir um 2º Pix com o mesmo código na mesma conta: tem de aparecer "O desconto já foi usado nesta conta."
