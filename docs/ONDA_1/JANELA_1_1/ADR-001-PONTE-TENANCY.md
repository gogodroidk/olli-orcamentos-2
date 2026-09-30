# ADR-001 — Ponte de tenancy por owner para tenancy por organização

Status: PROPOSTO — decisão final no Gate 1.4

Data: 2026-08-26

Nenhuma migration decorre automaticamente deste documento.

## Contexto

As tabelas de negócio usam user_id como identidade do owner. Membros ativos enxergam os dados do owner por donos_visiveis(). O aplicativo escolhe a associação ativa mais antiga para definir o owner de escrita.

Esse desenho não representa de forma persistente:

- a empresa à qual cada recurso pertence;
- a organização ativa escolhida pelo usuário;
- a capacidade específica de cada papel;
- relações entre objetos obrigatoriamente pertencentes ao mesmo tenant;
- histórico de transferência, fusão ou atuação multiempresa.

## Decisão proposta

Adotar organization_id como chave canônica de tenancy para todos os agregados V2.

Manter owner_user_id somente como propriedade da organização. Durante a ponte, user_id legado será derivado pelo servidor a partir da organização, nunca escolhido livremente pelo cliente.

O cliente pode solicitar uma organização, mas a autoridade é do servidor:

1. extrair actor_user_id do JWT;
2. validar associação ativa;
3. validar capacidade para a operação;
4. carimbar organization_id, actor_user_id e autoria no comando;
5. derivar compatibilidade legada quando necessária;
6. rejeitar referência cujo objeto não pertença à mesma organização.

## Invariantes

1. Todo recurso V2 pertence exatamente a uma organização.
2. O actor_user_id vem da sessão autenticada.
3. O owner não é usado como identidade substituta do funcionário.
4. Troca de organização exige uma ação explícita na interface.
5. Um papel concede capacidades por ação, não acesso amplo por convenção.
6. Relações de domínio não atravessam organizações.
7. Revogação de membro vale no servidor no momento da operação.
8. Worker com service_role aplica as mesmas regras antes de acessar o banco.
9. Dados de uma organização não entram em benchmark identificável de outra.
10. Migração e rollback são versionados e testados com dados sintéticos.

## Modelo conceitual

Entidades mínimas:

- organizations;
- organization_memberships;
- roles ou papéis conhecidos;
- capabilities;
- role_capabilities;
- membership_overrides apenas se uma necessidade real for validada;
- organization_id nos agregados de negócio;
- actor_user_id/criado_por em trilhas e versões;
- aggregate_version para concorrência.

## Organização ativa

A organização ativa é contexto de navegação e de comando, não uma permissão autônoma.

Regras propostas:

- o usuário escolhe entre associações ativas;
- app e painel exibem claramente nome e marca da empresa ativa;
- cada request/comando carrega a organização solicitada;
- servidor valida a associação a cada operação sensível;
- token/JWT não é fonte única para membresia que pode ser revogada;
- troca em um dispositivo não deve mudar silenciosamente outro dispositivo;
- uma operação iniciada em A não pode concluir em B após troca de contexto;
- outbox guarda organization_id e revalida antes do drain.

## Capacidades iniciais candidatas

| Capacidade | Owner | Admin | Gestor | Técnico |
|---|---:|---:|---:|---:|
| gerir empresa | sim | configurável | não | não |
| gerir membros e papéis | sim | sim | configurável | não |
| ver clientes atribuídos | sim | sim | sim | configurável |
| criar visita/OS | sim | sim | sim | sim |
| ver custo e margem | sim | configurável | configurável | não por padrão |
| conceder desconto | sim | configurável | configurável | não por padrão |
| publicar orçamento | sim | configurável | configurável | não por padrão |
| assinar/aprovar contrato | sim | configurável | configurável | não por padrão |
| editar plano PMOC | sim | configurável | configurável | não por padrão |
| registrar execução e evidência | sim | sim | sim | sim |
| excluir documento | sim | configurável | não por padrão | não |
| exportar dados | sim | configurável | não por padrão | não |

Esta tabela é hipótese de produto. A pesquisa deve confirmar as capacidades e evitar uma matriz excessivamente configurável no primeiro corte.

## Relações de co-tenancy

Preferência técnica:

- cada tabela possui id e organization_id;
- relações críticas usam constraints que garantem a mesma organization_id;
- operações compostas usam transação;
- objetos imutáveis, como versão assinada, não são atualizados;
- links públicos apontam para uma versão congelada, não para um rascunho mutável.

Onde FK composta for inviável, uma RPC transacional deve validar co-tenancy e possuir teste negativo. Validação apenas na interface não é suficiente.

## Estratégia de migration proposta

### Fase 0 — prova

- levantar catálogo real do banco em ambiente autorizado;
- identificar tabelas sem owner consistente;
- medir registros órfãos;
- criar banco efêmero com cópia sintética;
- escrever rollback antes da migration.

### Fase 1 — aditiva

- adicionar organization_id nullable;
- adicionar índices concorrentes quando aplicável;
- criar tabela explícita de mapeamento owner → organização;
- não alterar o comportamento V1.

### Fase 2 — backfill

- preencher organization_id pelo owner conhecido;
- separar ambiguidades em relatório;
- não escolher automaticamente em caso ambíguo;
- verificar contagem, órfãos e hash lógico.

### Fase 3 — ponte transacional

- criar funções/RPCs que validem organização e capacidade;
- derivar user_id legado pelo servidor;
- tornar explícita qualquer compatibilidade V1;
- impedir dois writers independentes no mesmo agregado.

### Fase 4 — policies V2

- RLS por organization_id e associação ativa;
- WITH CHECK para inserts e updates;
- funções SECURITY DEFINER com search_path vazio e grant mínimo;
- testes com owner, técnico, multiempresa, revogado e outsider.

### Fase 5 — endurecimento

- organization_id NOT NULL após prova;
- constraints de co-tenancy;
- remover dependência de donos_visiveis() por domínio;
- desativar caminho legado somente após rollback ensaiado.

## Alternativas consideradas

### Manter somente user_id do owner

Vantagem: menor mudança imediata.

Rejeição proposta: perpetua o problema multiempresa, confunde autoria com tenant e limita controle granular.

### Uma conta separada por empresa

Vantagem: isolamento conceitual simples.

Rejeição proposta: inviabiliza técnicos multiempresa, troca de contexto e administração centralizada.

### Colocar organization_id apenas em tabelas novas

Vantagem: migration menor.

Rejeição proposta: mantém duas definições de tenant indefinidamente e aumenta o risco de dupla escrita.

## Riscos

- backfill ambíguo;
- policy que abre mais acesso que a anterior;
- cliente antigo enviando payload incompatível;
- índices e constraints pesados;
- revogação atrasada por cache;
- endpoint service_role sem validação equivalente;
- analytics agregando organizações sem consentimento.

## Rollback

- migrations aditivas antes de destrutivas;
- feature flag por organização;
- V1 permanece leitor/escritor oficial até o cutover;
- ponte registra protocol_version;
- desativar comandos V2 sem apagar colunas;
- preservar audit log e idempotency keys;
- nunca fazer rollback apagando documentos ou trilhas.

## Critério de aceitação

Este ADR só pode virar ACEITO quando:

- catálogo remoto autorizado estiver conferido;
- matriz de capacidades tiver evidência de campo;
- backfill passar com zero órfão não explicado;
- todos os testes negativos passarem;
- dois dispositivos e duas organizações forem testados;
- Worker e clientes antigos tiverem compatibilidade provada;
- rollback for ensaiado.
