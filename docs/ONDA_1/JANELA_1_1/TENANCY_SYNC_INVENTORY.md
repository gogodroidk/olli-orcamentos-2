# Inventário de tenancy, autorização e sincronização

Data: 2026-08-26

Escopo: código e migrations versionadas em C:\OLLI_REL.

Limite probatório: este documento descreve o estado declarado no repositório. Ele não confirma que migrations, policies e grants estejam aplicados de forma idêntica no ambiente remoto.

## 1. Resumo executivo

O isolamento atual é tenant por dono, não tenant por organização persistida em cada recurso:

    usuário autenticado
      → associação ativa em uma organização
      → owner_user_id dessa organização
      → registros de negócio com user_id = owner_user_id

Esse desenho permitiu compartilhar os dados do dono com a equipe sem adicionar organization_id a todas as tabelas. Ele também cria quatro limites para a V2:

1. a organização é uma regra indireta de visibilidade, não a fronteira gravada no recurso;
2. um usuário membro de duas organizações não seleciona explicitamente a empresa ativa;
3. policies de negócio baseadas em donos_visiveis() não distinguem completamente técnico, gestor, admin e owner;
4. mobile e web podem escrever o mesmo agregado por caminhos diferentes, sem outbox durável e sem resolução explícita de conflito.

## 2. Mapa das superfícies

| Superfície | Fonte operacional | Autoridade remota | Forma de escrita |
|---|---|---|---|
| Mobile Expo | SQLite particionado por usuário | Supabase/Postgres + RLS | local primeiro; mirror assíncrono por cloudSync |
| Painel Vite | estado online no navegador | Supabase/Postgres + RLS | upsert direto no Supabase |
| Worker | request/response no edge | Supabase com service_role em rotas privilegiadas | validação no Worker + acesso que pode ignorar RLS |
| Site Astro | conteúdo estático | sem fonte de negócio própria | não deveria escrever domínio |

Evidências centrais:

- autenticação mobile persistente e PKCE: src/services/supabase.ts:1-30 e 47-110;
- partição SQLite antes da leitura: App.tsx:250-330;
- tabelas e migrations SQLite: src/database/database.ts:164-565;
- mirror fire-and-forget: src/database/database.ts:1-71;
- mapeamento de tabelas e push: src/services/cloudSync.ts:59-105 e 523-945;
- pull e tombstones: src/services/cloudSync.ts:1580-1634;
- sincronização do login: src/services/cloudSync.ts:2436-2489;
- cliente web Supabase: webapp/src/lib/supabase.ts:3-24;
- consultas web: webapp/src/olli/data.ts:1-117;
- mutações web: webapp/src/olli/mutacoes.ts:214-266;
- contrato duplicado de mapeamento web: webapp/src/olli/contrato.ts:1-20, 33-102, 165-180 e 281-304.

## 3. Entidades e chave de isolamento atual

| Domínio | Chave atual | Observação |
|---|---|---|
| organizacoes | id + owner_user_id | owner_user_id é único |
| organizacao_membros | org_id + user_id | papel e ativo definem participação |
| convites | org_id + token/aceite | aceite cria ou reativa membro |
| localizacoes_equipe | org_id + user_id | trilha de equipe |
| acessos_equipe | org_id + user_id | append-only pelo cliente |
| clientes, orçamentos, recibos, catálogo e empresa | user_id | user_id representa o owner |
| agenda e exclusões | user_id | visibilidade ampliada por donos_visiveis() |
| extras_sync | user_id + chave | chave composta |
| ordens de serviço | user_id + criado_por + tecnico_id | tenant continua sendo o owner |
| assets, contratos e PMOC | user_id + criado_por | relações de domínio em parte são referências lógicas |
| links públicos | orcamentos_publicos.user_id | eventos se ligam ao token |
| financeiro e IA | user_id | leitura própria ou operação pelo Worker |
| administração SaaS | user_id/actor_user_id | separado da gestão da empresa cliente |

A migration supabase/migrations/20260709_pmoc_fundacao.sql:36 registra expressamente que organization_id não é usado nas linhas de negócio.

## 4. Como a empresa de escrita é escolhida hoje

O aplicativo busca associações ativas, ordena por criado_em ascendente e escolhe a primeira. Em seguida, resolve o ownerUserId e injeta esse valor no user_id das tabelas compartilhadas.

Evidências:

- seleção da associação: src/services/equipe.ts:95-101;
- resolução do owner: src/services/contextoEquipe.ts:19-63;
- lista de tabelas que recebem user_id do owner: src/services/cloudSync.ts:597;
- injeção antes do upsert: src/services/cloudSync.ts:914-924;
- teste estático mobile/web: scripts/teste-tenant-escrita.ts:112-149.

Ponto positivo: a escolha é determinística e há caminhos fail-closed quando o contexto está desconhecido.

Ponto crítico: determinismo não equivale à intenção. Se o mesmo funcionário atuar em duas empresas, a associação mais antiga vira silenciosamente o tenant de escrita.

## 5. Helpers, funções e grants

### 5.1 Helpers organizacionais

| Função | Propósito | Proteção declarada |
|---|---|---|
| eh_membro_ativo(org_id) | verificar membresia ativa | SECURITY DEFINER, search_path vazio, authenticated |
| eh_gestao(org_id) | owner/admin/gestor | mesmo padrão |
| eh_admin_org(org_id) | owner/admin | mesmo padrão |
| donos_visiveis() | próprio usuário + owners das organizações ativas | mesmo padrão |
| criar_organizacao(nome) | criar organização e owner de forma atômica | authenticated |
| aceitar_convite(token) | validar e ativar associação | authenticated |

Evidências:

- supabase/migrations/20260707_multitenant.sql:136-209;
- supabase/migrations/20260707_multitenant.sql:538;
- supabase/migrations/20260708_multitenant_fixes.sql:45-88.

### 5.2 Funções auxiliares

| Função/grupo | Proteção ou uso |
|---|---|
| bloquear_troca_user_id | impede transferência de tenant e preserva autoria |
| bloquear_troca_membro | congela org_id e user_id da associação |
| pmoc_bloquear_versao_congelada | impede alteração de versão assinada/aprovada |
| perfil_visivel | restringe perfis a próprio usuário ou gestão comum |
| sync_profile_from_auth | trigger de espelhamento de auth.users |
| sincronizar_revogacao_publico | revoga link quando orçamento é excluído |
| saldo e consumo de créditos/cotas | RPCs sensíveis restritas predominantemente a service_role |
| administração SaaS | RPCs restritas ao Worker/service_role |

Evidências:

- supabase/migrations/20260708_multitenant_fixes.sql:12-31;
- supabase/migrations/20260729_membro_consentimento.sql:65;
- supabase/migrations/20260723_profiles_view_hardening.sql:17-44;
- supabase/migrations/20260709_pmoc_fundacao.sql:296;
- supabase/migrations/20260720_credit_ledger.sql:51-69;
- supabase/migrations/20260817_openrouter_quota_diaria.sql:294-513;
- supabase/migrations/20260820163046_admin_governanca_entitlements.sql:229-317.

## 6. RLS: o que existe e o que falta provar

| Área | Regra declarada | Lacuna |
|---|---|---|
| Organizações | membro ativo lê; owner administra | não há empresa ativa explícita |
| Membros | próprio membro ou gestão lê; entrada direta do client removida | matriz fina por ação ainda incompleta |
| Convites | criação privilegiada via Worker | Worker precisa validar plano, papel, organização e alvo |
| Dados compartilhados | user_id em donos_visiveis() | papel técnico pode herdar update/delete amplo |
| PMOC | mesmo padrão de owner/equipe | referências não garantem co-tenancy em todas as relações |
| Portal público | owner e Worker | equipe pode não ver trilha esperada |
| Financeiro/IA/admin | mínimo privilégio e service_role | precisa ser confrontado com o catálogo remoto |

Os scripts atuais verificam o texto e a ordem das migrations. Eles são úteis para regressão local, mas não substituem execução contra Postgres com JWTs diferentes.

## 7. Worker e bypass de RLS

O Worker usa service_role em rotas de administração, convites, QR, links públicos, pagamentos, créditos e cache. Nesses fluxos a RLS deixa de ser a última barreira.

Links e QR são exceções públicas deliberadas ao fluxo autenticado. A autorização ocorre pela posse de token opaco e deve ser limitada por revogação, allow-list de campos, resposta anti-enumeração e rate limit. Não se deve testar o QR como se um usuário B autenticado precisasse ser negado apenas por não pertencer à organização; qualquer pessoa com o token físico válido pode acessar o subconjunto público aprovado.

Requisito para cada operação privilegiada:

1. validar assinatura e validade do JWT;
2. derivar actor_user_id do token, nunca do corpo;
3. resolver organization_id no servidor;
4. conferir membresia ativa e papel;
5. conferir que o objeto-alvo pertence à mesma organização;
6. limitar a operação por allow-list;
7. registrar auditoria sem dados pessoais desnecessários;
8. manter idempotência para cobrança, crédito, convite e webhook.

Evidências:

- worker/src/admin.js:49 e 85;
- worker/src/equipe.js:91 e 109;
- worker/src/link.js:9;
- worker/src/index.js:934.

## 8. Storage

Não foram encontradas migrations de storage.buckets, storage.objects, políticas de bucket ou chamadas de upload/download do Supabase Storage.

O estado atual é:

| Conteúdo | Local atual |
|---|---|
| Fotos de orçamento | dispositivo |
| Logo e assinatura pequenos | data URI em empresa.dados |
| PDFs e anexos grandes | ainda sem backend versionado |
| Abstração futura | src/services/ports/StorageProvider.ts |

Antes de criar laudos, contratos assinados, fotos técnicas e anexos compartilháveis, a V2 precisa de:

- bucket privado;
- caminho derivado no servidor;
- organização persistida no objeto;
- policy de leitura/escrita por associação ativa e capacidade;
- URLs assinadas curtas;
- revogação e retenção;
- teste de isolamento por usuário e organização;
- trilha de quem criou, assinou, baixou e revogou.

Convenção proposta:

    organizations/{organization_id}/documents/{document_id}/{version_id}/...
    organizations/{organization_id}/assets/{asset_id}/...
    organizations/{organization_id}/service-orders/{order_id}/...

O caminho enviado pelo cliente não pode ser a prova de autorização.

## 9. Sincronização atual

### 9.1 Mobile

O mobile grava no SQLite e chama pushRow como mirror. Sem sessão ou sem conectividade, o push pode não persistir um comando. Uma sincronização futura tenta reconciliar linhas e tombstones, mas não existe uma fila durável com estados pendente, em processamento, confirmado e falho.

Evidências:

- no-op offline: src/services/cloudSync.ts:535-548;
- disparo fire-and-forget: src/database/database.ts:22-32;
- pull aditivo: src/services/cloudSync.ts:1580-1634;
- push por timestamp: src/services/cloudSync.ts:1860-1943.

### 9.2 Web

O painel escreve diretamente no Supabase. Ele não participa da partição SQLite, não possui a mesma fila local e replica parte do contrato de transformação de dados.

### 9.3 Consequência

O mecanismo atual oferece espelhamento e reconciliação básica, não uma outbox completa. Chamar isso de offline-first transacional seria impreciso.

## 10. Pontos de dupla escrita

| Ponto | Caminho A | Caminho B | Risco |
|---|---|---|---|
| Entidades comerciais | mobile SQLite → cloudSync | web → Supabase direto | blob incompleto, conflito, ordem diferente |
| Link de orçamento | mobile cria orcamentos_publicos | Worker atualiza status/trilha | dono do estado não explícito |
| PMOC/QR | mobile altera assets e PMOC | Worker resolve QR e grava eventos | autorização e versão divergentes |
| Financeiro/IA/admin | app solicita | Worker/service_role grava ledger/cotas | idempotência e auditoria obrigatórias |
| PDF | expo-print/share | impressão do navegador | documentos visualmente ou semanticamente diferentes |

Evidências adicionais:

- src/services/clienteLink.ts:127-175;
- worker/src/link.js:118-169 e 342-386;
- webapp/src/olli/contrato.ts:82-86;
- worker/src/index.js:852-1123.

## 11. Riscos priorizados

| Prioridade | Risco | Gate |
|---|---|---|
| P0 | recursos de negócio sem organization_id | ADR-001 + migration aditiva futura |
| P0 | membro multiempresa sem organização ativa | teste de seleção explícita |
| P0 | papel técnico com capacidade ampla em policies de negócio | matriz de capacidades + testes |
| P0 | comando offline aplicado depois da revogação | reautorização no drain do outbox |
| P1 | referências PMOC entre tenants | FK/constraint ou validação transacional |
| P1 | service_role contorna RLS | autorização por endpoint e teste negativo |
| P1 | portal/trilha owner-only | decisão funcional documentada |
| P1 | Storage ainda sem contrato | bucket privado antes de anexos |
| P1 | múltiplos escritores por agregado | ADR-002 e ADR-003 |

## 12. Matriz mínima de testes negativos

### SELECT

- outsider não vê nenhuma linha da organização A;
- membro revogado perde acesso imediatamente;
- membro de A e B vê somente a organização ativa no desenho V2;
- técnico vê apenas perfis e recursos permitidos;
- link revogado não revela cliente, preço, contato ou anexo;
- token QR ausente, malformado, inexistente ou revogado não distingue se o ativo existiu;
- resposta QR contém somente a allow-list pública aprovada;
- QR nunca retorna cliente, endereço completo, contrato, custo, anexos ou campos internos;
- endpoint QR limita enumeração e abuso por rate limit;
- resposta de token revogado é indistinguível da resposta de token inexistente.

### INSERT

- cliente não escolhe organization_id, user_id ou criado_por arbitrariamente;
- associação não é inserida diretamente;
- convite expirado, reutilizado ou destinado a outra identidade falha;
- técnico cria somente os recursos da sua capacidade;
- relação cliente/asset/contrato/plano/ordem entre organizações falha;
- endpoint Worker falha antes do service_role quando ator, papel ou alvo não conferem.

### UPDATE

- user_id e organization_id são imutáveis;
- técnico não promove a si mesmo nem altera owner;
- técnico não muda preço global, versão assinada ou plano aprovado sem capacidade;
- comando offline de membro revogado falha no servidor;
- concorrência em contrato, laudo, agenda e financeiro gera conflito explícito.

### DELETE

- técnico não apaga catálogo, cliente, documento assinado ou recurso fora da allow-list;
- tombstone não alcança entidade de outro tenant;
- remoção de membro preserva histórico;
- exclusão respeita retenção e revoga exposição pública.

### RPC

- authenticated não executa RPCs exclusivas de service_role;
- SECURITY DEFINER usa search_path vazio, nomes qualificados, REVOKE PUBLIC e grants mínimos;
- criar_organizacao cria apenas para o próprio auth.uid();
- aceitar_convite não permite roubo, reuso ou bypass de expiração.

### Storage

- A não lista, lê, assina URL, substitui ou remove objeto de B;
- membro revogado perde leitura e upload;
- URL assinada expira;
- bucket nunca é público;
- exclusão preserva a evidência que possui obrigação de retenção.

## 13. Harness recomendado

Usar ambiente local ou efêmero, nunca produção, com no mínimo:

- owner A;
- técnico B membro de A;
- outsider C;
- usuário D membro legítimo de A e de outra organização.

Para cada tabela e RPC, testar SELECT, INSERT, UPDATE e DELETE com os quatro contextos. O teste deve verificar tanto sucesso permitido quanto falha negada e guardar somente IDs sintéticos.

## 14. Regra para a ponte V1 → V2

Até o Gate 1.4:

- V1 continua funcional;
- não adicionar dual-write oculto;
- não confiar em organization_id vindo do cliente;
- não chamar o sync atual de outbox durável;
- não criar Storage público;
- não promover ADR proposto a decisão final sem prova de migração, rollback e isolamento.
