# Modelo de ameaças e plano de testes negativos

Estado: **obrigatório para Onda 2; ainda não prova runtime/produção**

## 1. Ativos protegidos

- identidade, sessão e membership;
- dados de clientes, locais, ativos e funcionários;
- custo, margem, desconto e indicadores privados;
- documentos, versões, assinatura/aceite e evidências;
- comandos offline, idempotência e trilha;
- tokens públicos, URLs assinadas e chaves;
- créditos, pagamentos e eventos financeiros;
- prompts, payloads de IA e dados transmitidos a providers.

## 2. Ameaças prioritárias

| ID | Ameaça | Controle arquitetural | Prova obrigatória |
|---|---|---|---|
| T01 | spoofing de ator/papel/tenant pelo payload | derivar ator da sessão; revalidar membership/capacidade | enviar IDs/papel falsos e provar negação |
| T02 | leitura/mutação cross-tenant | `organization_id`, co-tenancy, RLS/ABAC fail-closed | matriz A/B/outsider em SELECT/INSERT/UPDATE/DELETE |
| T03 | comando offline após revogação | reautorização dentro da transação de aplicação | revogar antes do drain e provar `rejected` |
| T04 | replay/duplicação | idempotency key + hash do payload + resultado persistido | repetir 10x e testar payload divergente |
| T05 | lost update/LWW crítico | `expected_version`, conflito explícito, imutabilidade | dois writers concorrentes e resolução visível |
| T06 | documento muda após aceite | snapshot/hash canônico e nova versão para retificação | alterar origem e provar versão antiga invariável |
| T07 | evidência substituída ou falsa | digest servidor, storage privado/versionado | trocar bytes/MIME/key e provar detecção |
| T08 | URL/token público enumerável ou duradouro | token opaco, escopo, expiração, rate limit, revogação | enumeração, token expirado/revogado e respostas indistinguíveis |
| T09 | vazamento de custo/PII para cliente ou IA | projeções/DTOs allowlistados | testes estáticos e dinâmicos com aliases/campos extras |
| T10 | `service_role` vira bypass de autorização | gateway autoriza antes do banco e audita | endpoint com ator/alvo inválidos falha antes da escrita |
| T11 | `SECURITY DEFINER` explorável | search_path controlado, nomes qualificados, grants mínimos | auditoria de função e chamadas por papéis não autorizados |
| T12 | upload malicioso/DoS | allowlist MIME/tamanho, quarantine/scan, quota | arquivo disfarçado, gigante, zip bomb conforme adapter |
| T13 | log/telemetria sensível | logging estruturado mínimo e redaction | scanner/teste de logs sem conteúdo do domínio |
| T14 | prompt injection/egress excessivo | caso de uso fechado, DTO allowlist, saída não executável | texto hostil não amplia tools/ações/dados |
| T15 | analytics reidentifica empresa | bloqueado na V1; coorte/consentimento/política futura | feature flag sempre false e ausência de endpoint |
| T16 | rollback perde trilha | migration forward/compensatória e retenção | rollback preserva documentos, comandos e eventos |

## 3. Matriz de atores sintéticos

- `owner_a`: owner da organização A;
- `admin_a`: administrador de A;
- `tech_a`: técnico ativo e atribuído em A;
- `viewer_a`: leitura limitada em A;
- `revoked_a`: membership revogada em A;
- `multi_ab`: membro legítimo de A e B;
- `outsider`: usuário autenticado sem membership;
- `public_client`: aprovador externo com token de uma única versão;
- `service_executor`: identidade técnica sem autoridade autônoma de domínio.

## 4. Suites obrigatórias

### Auth/RBAC/RLS

- cada tabela/RPC/rota: sucesso permitido e falha negada por ator;
- membership revogada/expirada;
- papel desconhecido e capacidade ausente;
- organização solicitada diferente da membership;
- tentativa de alterar owner/tenant/actor;
- isolamento entre `organization_memberships` e RBAC interno SaaS.

### Documento/assinatura/evidência

- schema/version inválidos;
- papel obrigatório ausente/duplicado;
- recusa, expiração e revogação;
- hash adulterado;
- retificação e cópia da versão anterior;
- arquivo de outro tenant, MIME divergente e digest incorreto;
- URL assinada expirada e membro revogado.

### Outbox/sync

- app encerrado após transação local;
- rede oscilante, timeout e retry;
- replay, claim concorrente e crash pós-aplicação/pré-ack;
- versão conflitante;
- revogação entre enqueue/drain;
- logout/troca de conta sem misturar partições.

### Preço/IA

- custo/margem ausentes em visão pública e provider DTO;
- campos extras/aliases rejeitados;
- ausência de preço permanece manual;
- prompt injection não dispara ferramenta/ação;
- timeout/cota/provider indisponível usa fallback;
- sugestão nunca é aplicada sem evento humano explícito.

### Compatibilidade/rollback

- cliente V1 não sobrescreve agregado migrado;
- projeção V2→V1 é idempotente/ordenada;
- feature flag desliga novos comandos sem apagar pendentes;
- rollback mantém documento aceito e audit trail;
- mobile/web chegam à mesma versão canônica.

## 5. Gates de segurança

- zero achado P0 aberto;
- P1 precisa de correção ou aceite humano documentado, com prazo/mitigação;
- scanner sem segredo conhecido e dependências sem vulnerabilidade crítica não mitigada;
- ameaça nova atualiza este modelo e o teste correspondente;
- teste sintético não substitui validação de RLS/storage/infra no ambiente autorizado;
- qualquer dado real exige base legal, minimização, retenção e autorização do dono.
