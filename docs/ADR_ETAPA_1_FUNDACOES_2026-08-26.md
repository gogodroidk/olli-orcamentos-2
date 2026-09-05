# ADR — Fundações estabilizadas na Etapa 1

- **Data:** 2026-08-26
- **Status:** aceito no repositório; dependências externas permanecem nos gates
- **Escopo:** estabilidade e verdade do produto antes das novas ondas do plano mestre
- **Não autoriza:** deploy, alteração de banco live, criação/cópia de segredo, OAuth,
  cobrança, publicação ou envio a terceiros

## Contexto

O produto já tinha uma superfície ampla, mas algumas decisões críticas ainda dependiam
de estado local, configuração implícita ou documentação desatualizada. Expandir IA,
contratos, precificação e PMOC sobre essas ambiguidades aumentaria risco de cobrança
indevida, perda de identidade visual, número duplicado e promessa de integração que não
funciona no aplicativo assinado.

Esta ADR registra seis decisões pequenas e estruturais. Elas não concluem o produto;
estabelecem contratos técnicos para as próximas etapas.

## 1. Cota de IA e crédito são decisões do servidor

**Decisão.** O saldo mensal exibido localmente pode servir de cache/experiência offline,
mas não autoriza uma chamada. `public.ia_uso_gratis`, validada pelo backend, é a fonte
autoritativa da cota. Quando a franquia termina, o servidor devolve o estado e a interface
oferece usar um crédito somente após consentimento explícito.

O retry de uma mesma intenção reaproveita `creditoRef`. Isso torna a cobrança idempotente
e impede que um timeout/retoque no botão consuma dois créditos. Sempre existe fallback
manual; IA não bloqueia a criação de um orçamento.

**Consequências.** O contador local pode ficar temporariamente defasado, mas nunca decide
sozinho cobrança ou autorização. Telemetria deve distinguir franquia, crédito consentido,
erro de provedor e fallback manual.

## 2. Modelos gratuitos são uma cadeia verificada, não uma constante eterna

**Decisão.** O worker usa uma cadeia explícita de modelos gratuitos text-to-text e o
script `scripts/verificar-modelos-openrouter.mjs` compara app/worker/config com o catálogo
oficial. O gate exige preço zero, saída de texto e suporte às capacidades estruturadas
necessárias.

**Consequências.** Disponibilidade gratuita é externa e pode mudar. O release deve rodar
`npm run check:ai-models`; falhar fechado é preferível a migrar silenciosamente para um
modelo pago. Modelo alternativo não muda as regras de privacidade, fonte, confirmação
humana ou limite de escopo.

## 3. Identidade pequena fica portável; binários operacionais vão para storage privado

**Decisão.** Logo e assinatura visual são normalizados para data URI pequena, com limite
de entrada, dimensão e tamanho final. Isso impede persistir `file://`/`content://`, que
funciona apenas no aparelho que selecionou o arquivo.

Fotos de serviço, anexos, PDFs, manuais e laudos **não** devem seguir esse padrão: são
maiores, podem conter dados do cliente e exigem objeto privado, RLS/policy, URL assinada,
retenção e exclusão.

**Consequências.** A identidade acompanha sync/backup sem depender do URI local. O limite
é deliberado: não transformar a linha `empresa.dados` em repositório de arquivos.

## 4. Número de documento tem recuperação no cliente e garantia futura no banco

**Decisão.** App e web reconhecem somente a colisão real da constraint de número
(`23505` com constraint/campo esperado). Nesse caso, calculam um número acima dos pisos
local, remoto e contador, tentam novamente por até três ciclos e gravam
`numeroAnterior`/`renumeradoEm` para auditoria. A releitura do blob local durante a
transação preserva edições concorrentes da interface.

A garantia definitiva continua sendo um índice único por tenant. A migration permanece
com sufixo `.pendente` porque dados live podem conter duplicatas.

**Consequências.** Erros de RLS, rede ou outra constraint não são mascarados como colisão.
Aplicar o índice exige relatório de duplicatas, regra explícita de correção, backup e
rollback em janela autorizada.

## 5. Google Agenda nativa fica fail-closed

**Decisão.** A existência de um client ID não habilita o scaffold legado. A capacidade
nativa permanece explicitamente desabilitada até existir arquitetura OAuth aceita pelo
Google para aplicativo instalado, scopes mínimos, configuração oficial e prova no app
assinado. Exportação `.ics` e link para o Google Calendar são fluxos separados.

**Consequências.** A interface não promete uma integração que pode falhar por desenho.
Nenhum segredo, redirect ou console externo foi alterado nesta etapa.

Referência: [OAuth 2.0 para aplicativos instalados](https://developers.google.com/identity/protocols/oauth2/native-app).

## 6. Data civil de recibo é validada antes de virar timestamp

**Decisão.** `DD/MM/AAAA` é uma data civil, não um ISO parcial. O conversor valida dia,
mês e round-trip do calendário e produz ISO em meio-dia UTC, evitando mudança de dia
por fuso. Datas impossíveis, como 31/02, são recusadas em vez de normalizadas pelo
JavaScript.

**Consequências.** Mobile e web usam o mesmo contrato semântico. Novos documentos devem
separar explicitamente data civil de instante auditável.

## Gates derivados

Um release candidato deve, no mínimo:

1. passar typecheck, suíte, contraste, Expo Doctor e checagem de configuração;
2. consultar o catálogo de modelos gratuitos no momento do release;
3. gerar build web e bundle Android sem depender de `.env` privada implícita;
4. provar em aparelho a identidade após reinício/sync e o fluxo de IA sem/dentro da cota;
5. manter Google Agenda fechada enquanto o aceite nativo não existir;
6. manter a migration de unicidade pendente enquanto não houver auditoria live;
7. registrar separadamente qualquer aceitação externa — código local não é prova de
   produção.
