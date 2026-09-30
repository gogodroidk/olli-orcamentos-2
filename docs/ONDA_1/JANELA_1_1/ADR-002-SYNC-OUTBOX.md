# ADR-002 — Outbox durável, idempotência e conflito explícito

Status: PROPOSTO — decisão final no Gate 1.4

Data: 2026-08-26

## Contexto

O mobile grava localmente e chama o espelhamento de nuvem sem manter uma fila durável de comandos. Offline ou sem sessão, uma tentativa pode virar no-op. Uma sincronização posterior reconcilia linhas por timestamps e tombstones, mas não expõe o ciclo de vida de cada intenção.

O painel web escreve diretamente no Supabase. Assim, mobile, web e Worker podem alterar o mesmo agregado por caminhos diferentes.

## Decisão proposta

Introduzir um contrato de comando versionado e uma outbox local durável para operações de domínio.

O primeiro corte deve cobrir somente o slice organization → cliente → local. Não migrar todos os módulos simultaneamente.

## Estrutura mínima de um comando

| Campo | Função |
|---|---|
| command_id | UUID estável criado uma vez |
| idempotency_key | deduplicação no servidor |
| protocol_version | compatibilidade entre clientes |
| organization_id | tenant solicitado e revalidado |
| actor_user_id | derivado da sessão no servidor |
| device_id | diagnóstico e conflito, sem ser prova de autorização |
| aggregate_type | cliente, local, orçamento etc. |
| aggregate_id | ID estável do agregado |
| operation | ação de domínio permitida |
| expected_version | controle de concorrência otimista |
| payload | dados mínimos da ação |
| created_at_local | ordenação diagnóstica |
| state | pending, sending, acknowledged, conflict, rejected, dead_letter |
| attempts | contador de tentativas |
| next_attempt_at | backoff |
| last_error_code | código sanitizado, sem segredo |

Requisitos operacionais iniciais:

- payload JSON serializado com máximo de 64 KiB por comando;
- arquivo, foto, áudio e PDF ficam fora da outbox e são referenciados por identificador privado;
- senha, token de sessão, chave de API e credencial nunca entram no payload;
- campos pessoais são reduzidos ao necessário para executar a ação;
- payload sensível offline exige armazenamento cifrado por chave protegida pelo sistema operacional; se essa proteção não estiver disponível, a ação sensível não pode ficar pendente em texto claro;
- logout, troca de conta e revogação limpam somente a partição autorizada, sem misturar tenants.

## Fluxo

    ação do usuário
      → transação SQLite grava domínio local + outbox
      → worker de sincronização seleciona pending
      → servidor autentica e reautoriza
      → servidor deduplica idempotency_key
      → valida expected_version
      → aplica transação
      → devolve versão canônica
      → cliente marca acknowledged e reconcilia

Se o app fechar depois da gravação local, o comando continua pendente.

## Regras de idempotência

1. A mesma idempotency_key e o mesmo payload retornam o resultado anterior.
2. A mesma chave com payload diferente falha.
3. O servidor persiste resultado e versão da aplicação.
4. Retries de rede não criam novo orçamento, crédito, convite, pagamento ou evento.
5. Webhooks possuem namespace próprio de chave.
6. Chaves têm retenção compatível com o risco da operação.

## Autorização no drain

Autorização é verificada quando o servidor recebe o comando, não quando ele entrou na outbox.

Consequência desejada:

- técnico cria uma visita offline;
- owner revoga o técnico antes da reconexão;
- comando chega depois;
- servidor rejeita por membership_revoked;
- aplicativo mostra ação pendente rejeitada e permite exportar a anotação local sem invadir o tenant.

## Estratégia de conflitos

| Tipo de dado | Estratégia proposta |
|---|---|
| perfil simples não crítico | merge por campo somente se versões não colidirem |
| cliente/local | concorrência otimista e tela de resolução |
| agenda | detectar sobreposição; não sobrescrever silenciosamente |
| orçamento rascunho | nova versão ou merge assistido |
| orçamento aprovado | imutável; alteração cria nova versão |
| contrato assinado | imutável |
| laudo final | imutável; correção vira adendo/versão |
| execução/medição | append-only quando possível |
| financeiro/crédito | transação e idempotência forte |
| exclusão | tombstone versionado e política de retenção |

Last-write-wins silencioso não é aceitável para contrato, laudo, aprovação, agenda crítica ou financeiro.

## Backoff e falhas

- retry exponencial com jitter para erro transitório;
- pausa quando sem sessão ou sem rede;
- sem retry automático para 4xx de autorização/validação;
- estado conflict para versão divergente;
- estado rejected para política;
- dead_letter somente após limite definido;
- UI mostra quantidade e motivo amigável;
- telemetria registra código, latência e contagem, não payload sensível.

## Contrato entre mobile, web e Worker

- a mesma operação de domínio usa o mesmo schema;
- o painel pode enviar comandos online sem manter SQLite, mas recebe as mesmas regras;
- o Worker é o executor/autorizador, não um segundo domínio paralelo;
- PDFs e links públicos consomem versões canônicas;
- cada aggregate_type tem um writer oficial por fase;
- mappers duplicados são substituídos gradualmente por schemas compartilhados versionados.

## Escolha de tecnologia

Ainda não decidida.

Comparar na Janela 1.3:

- outbox própria sobre SQLite + Worker + Postgres;
- PowerSync;
- outra solução compatível com Expo, web, Supabase, RLS, conflito e custo.

Critérios:

- suporte real a Expo SDK atual;
- comportamento offline provado;
- isolamento por organização;
- idempotência;
- conflitos observáveis;
- custo e lock-in;
- migração gradual;
- capacidade de teste local;
- operação com modelo de dados existente.

Nenhum fornecedor deve ser adotado só por marketing ou conveniência de demonstração.

## Migração incremental

1. instrumentar o comportamento V1 sem mudar resultado;
2. criar outbox local e executor sintético;
3. habilitar somente cliente/local em ambiente local;
4. rodar shadow read e comparar;
5. habilitar por organização piloto;
6. observar duplicatas, rejeições, latência e conflitos;
7. ampliar agregado por agregado.

## Projeção de compatibilidade V2 → V1

Durante o piloto, a projeção legada não pode ser um segundo writer independente.

Decisão proposta:

1. antes de uma organização/agregado entrar no piloto, V1 continua sendo o writer oficial;
2. no instante do cutover dessa organização/agregado, o executor V2 no servidor vira o único writer;
3. o mesmo executor produz a representação compatível para leitores V1;
4. quando canônico V2 e projeção V1 estiverem no mesmo Postgres, ambos são gravados na mesma transação;
5. se a projeção não puder compartilhar transação, uma outbox transacional do servidor registra um job observável e idempotente;
6. command_id, aggregate_version e organization_id identificam e ordenam a projeção;
7. evento com versão menor ou igual à já projetada é ignorado de forma idempotente;
8. cliente V1 não sobrescreve agregado migrado: sua escrita é bloqueada com atualização obrigatória ou adaptada pelo mesmo gateway de comandos;
9. divergência gera alerta e relatório; não há reparo automático;
10. a projeção é removida por agregado somente após não existirem leitores V1 suportados e o Gate de cutover estar verde.

O mecanismo exato deve ser provado em banco efêmero. Nenhum piloto pode começar enquanto essa projeção, sua ordem e seu rollback não tiverem teste automatizado.

## Retenção e expurgo

Defaults propostos para validar no spike:

- comando acknowledged: manter localmente por 7 dias após confirmação, depois expurgar payload;
- conflict, rejected e dead_letter: manter por até 30 dias para resolução, depois preservar somente metadados necessários e expurgar payload;
- idempotency key comum no servidor: mínimo de 90 dias;
- pagamento, crédito, assinatura, contrato e webhook: retenção específica nunca menor que a janela de repetição e a obrigação aplicável ao domínio;
- prazo final precisa ser aprovado no Gate 1.4 após pesquisa jurídica, operacional e de privacidade.

Exportação de comando rejeitado:

- exige ação explícita do usuário;
- remove segredo e minimiza dados pessoais;
- fica vinculada à organização original;
- não pode ser reimportada automaticamente;
- nunca converte rejeição de autorização em retry noutro tenant.

## Métricas

- comandos pending por idade;
- taxa de acknowledged;
- retry por código;
- duplicatas deduplicadas;
- conflitos por aggregate_type;
- rejeições por autorização;
- comandos após revogação;
- divergência shadow V1/V2;
- atraso e falha da projeção V2 → V1;
- tempo até consistência;
- dead letters.

## Rollback

- feature flag desliga envio V2;
- outbox permanece local e exportável;
- V1 continua writer oficial até cutover;
- não apagar comandos para mascarar erro;
- servidor aceita somente protocol_version conhecida;
- downgrade nunca altera documento imutável;
- reconciliação possui relatório antes de qualquer mutação corretiva.

## Critério de aceitação

- matar o app após ação não perde o comando;
- enviar a mesma chave dez vezes gera um único efeito;
- membro revogado não aplica comando;
- conflito aparece ao usuário;
- organização A não afeta B;
- mobile e web produzem a mesma versão canônica;
- leitor V1 enxerga a projeção da versão V2 sem poder sobrescrevê-la;
- retenção e expurgo removem payload no prazo sem quebrar deduplicação obrigatória;
- rollback ensaiado preserva dados;
- observabilidade não contém segredo ou dado pessoal excessivo.
