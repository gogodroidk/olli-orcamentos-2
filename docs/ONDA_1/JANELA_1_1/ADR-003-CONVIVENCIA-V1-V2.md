# ADR-003 — Convivência segura entre V1 e V2

Status: PROPOSTO — decisão final no Gate 1.4

Data: 2026-08-26

## Contexto

Reescrever todo o produto e ligar tudo de uma vez ampliaria o risco em tenancy, offline, documentos, cobrança, IA e publicação. A V1 já possui superfícies utilizáveis, mas os contratos de dados não sustentam ainda a plataforma completa desejada.

A evolução precisa permitir:

- criar uma base nova onde é estruturalmente necessário;
- reaproveitar o que já funciona;
- comparar V1 e V2;
- voltar atrás sem perda;
- impedir duas fontes de verdade ocultas.

## Decisão proposta

Usar evolução incremental por fatias verticais, com V1 como fallback temporário e V2 atrás de flags.

Primeira fatia:

    organização ativa
      → cliente
      → local
      → comando idempotente
      → autorização
      → reconciliação

PMOC completo, documentos, IA e analytics só avançam depois que essa espinha estiver comprovada.

## Princípios

1. Um agregado possui um writer oficial em cada fase.
2. Shadow read compara sem mudar comportamento.
3. Shadow write só existe em ambiente controlado e com decisão explícita.
4. Dupla escrita invisível é proibida.
5. Todo payload carrega schema_version e protocol_version.
6. Clientes antigos têm versão mínima conhecida.
7. Feature flag tem owner, prazo e kill switch.
8. Falha de V2 não pode corromper V1.
9. Rollback preserva trilha e comandos.
10. Release é por gate, não por calendário.

## Matriz de writer por fase

| Fase | Mobile | Web | Worker | Banco |
|---|---|---|---|---|
| Baseline | SQLite + cloudSync V1 | Supabase direto V1 | rotas atuais | schema atual |
| Shadow read | V1 escreve; V2 compara leitura | V1 escreve; V2 compara | registra divergência | colunas V2 aditivas |
| Piloto por organização/agregado | comando V2 em cliente/local; V1 não escreve o agregado migrado | comando V2 no mesmo contrato; V1 não escreve o agregado migrado | único executor V2 e dono da projeção V1 | transação V2 + projeção compatível |
| Cutover do agregado | V2 | V2 | V2 | organization_id canônico |
| Pós-cutover | fallback somente leitura por prazo | fallback somente leitura por prazo | rejeita protocolo obsoleto após janela | legado removido em migration posterior |

## Projeção para leitores V1

Quando um agregado piloto passa a ser escrito por V2:

- o executor V2 é o único dono do canônico e da projeção compatível;
- a projeção ocorre na mesma transação quando possível;
- caso contrário, uma outbox transacional do servidor usa command_id, organization_id e aggregate_version;
- versões antigas ou repetidas são ignoradas;
- cliente V1 recebe modo somente leitura, atualização obrigatória ou adaptação pelo gateway;
- nenhum cliente V1 pode gravar diretamente sobre a versão V2;
- divergência é observada e reparada somente após revisão;
- a projeção possui métrica, retry, dead letter e kill switch;
- sua remoção exige zero leitor V1 suportado e rollback encerrado.

Esse contrato elimina a interpretação ambígua de que V1 e V2 seriam writers simultâneos durante o piloto.

## Feature flags mínimas

- v2_org_context;
- v2_customer_site_commands;
- v2_outbox;
- v2_shadow_read;
- v2_document_versions;
- v2_storage_private;
- v2_ai_suggestions;
- v2_pricing_benchmark.

Cada flag deve ter:

- escopo local, ambiente ou organização;
- valor padrão fechado;
- responsável;
- data de expiração/revisão;
- métrica;
- kill switch;
- comportamento de rollback.

Flags de piloto são avaliadas no servidor por organização e agregado. Esconder uma tela no cliente não é controle suficiente para impedir escrita V1.

## Compatibilidade

### Schema

- mudanças primeiro aditivas;
- campos novos opcionais durante ponte;
- servidor normaliza versões conhecidas;
- resposta canônica informa schema_version;
- campo desconhecido não autoriza ação.

### Protocolo

- clientes enviam protocol_version;
- servidor define mínimo e máximo aceitos;
- incompatibilidade retorna erro explícito e atualização requerida;
- app não tenta converter silenciosamente ação sensível.

### Documentos

- rascunho pode evoluir;
- aprovado/assinado referencia versão congelada;
- V1 e V2 não geram conteúdo diferente com o mesmo version_id;
- renderizadores mobile/web passam por golden tests.

## Shadow mode

Permitido:

- V1 continua respondendo;
- V2 lê a mesma entrada em ambiente seguro;
- comparador registra igualdade, divergência e causa;
- dados pessoais são minimizados;
- nenhuma resposta V2 chega ao usuário sem flag.

Proibido:

- gravar duas vezes em produção sem idempotência;
- corrigir divergência automaticamente;
- copiar base real para ambiente inseguro;
- registrar payload integral em log;
- esconder resultado divergente.

## Ordem de cutover

1. organização ativa e capacidades;
2. cliente e local;
3. equipamento/asset;
4. agenda e ordem;
5. orçamento e precificação;
6. versões documentais;
7. contrato e assinatura;
8. PMOC recorrente;
9. Storage/evidências;
10. IA contextual;
11. benchmark agregado.

Essa ordem pode mudar no Gate 1.4 com evidência. Financeiro e cobrança mantêm gate independente.

## Gates

### Gate técnico

- build e testes das quatro superfícies;
- Expo Doctor verde após patch controlado;
- RLS negativo real;
- idempotência e conflito;
- dispositivo físico;
- rollback ensaiado.

### Gate de produto

- tarefa reduz tempo ou erro;
- prestador entende a mudança;
- permissões correspondem ao trabalho real;
- IA explica e pede confirmação;
- fluxo HVAC fecha de ponta a ponta.

### Gate de segurança e privacidade

- organização não vaza;
- dados de benchmark têm consentimento, minimização e limiar;
- Storage privado;
- service_role coberto por autorização;
- audit log suficiente e não excessivo;
- retenção definida.

### Gate externo

- credenciais e OAuth;
- revisão jurídica/profissional de modelos;
- publicação;
- produção;
- pagamentos.

## Observabilidade

Dashboard interno de rollout deve distinguir:

- versão do cliente;
- flag ativa;
- organização piloto com identificador pseudonimizado;
- comandos V1/V2;
- divergência shadow;
- estado e atraso da projeção V2 → V1;
- erros por código;
- conflito;
- rollback acionado;
- latência e fila;
- sem documento, telefone, endereço ou segredo no log.

## Rollback

1. desligar a flag do agregado;
2. impedir novos comandos V2;
3. deixar comandos existentes em estado preservado;
4. voltar leitura para V1;
5. gerar relatório de divergência;
6. corrigir somente com migration/reconciliação revisada;
7. manter colunas aditivas até a causa ser resolvida;
8. nunca apagar histórico ou versão assinada para restaurar compatibilidade.

## Critérios para remover V1

- período piloto concluído;
- zero vazamento entre tenants;
- taxa de divergência dentro do limite definido;
- nenhum dead letter sem explicação;
- clientes mínimos atualizados;
- suporte e documentação prontos;
- backup e restauração testados;
- owner aprova cutover;
- janela de rollback encerrada formalmente.

## Consequência

A plataforma pode receber base nova sem uma reescrita big bang. O custo é manter compatibilidade temporária e disciplina de flags, schema e observabilidade. Esse custo é aceito como hipótese porque reduz o risco de perda de dados e de regressão silenciosa.
