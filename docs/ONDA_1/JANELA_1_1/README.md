# OLLI V2 — Onda 1, Janela 1.1

Data do checkpoint: 2026-08-26

## Resultado

Janela 1.1 concluída como checkpoint local de arquitetura e segurança.

O repositório está reproduzível nas quatro superfícies, mas o release geral não está aprovado: o Expo Doctor detectou 16 dependências com atualização de patch recomendada. As demais verificações locais executadas nesta janela passaram.

Nenhuma migration foi aplicada, nenhum deploy foi realizado, nenhum dado de produção foi consultado e nenhuma credencial foi aberta.

## O que esta janela entregou

- linha de base do repositório, ferramentas, builds, testes e bloqueios;
- fotografia imutável das 44 alterações já presentes na árvore de trabalho;
- mapa das quatro superfícies e dos pontos de dupla escrita;
- inventário do tenancy atual, RLS, SECURITY DEFINER, Worker privilegiado e futura camada de Storage;
- ledger de cota sem inventar números que o agente não consegue observar;
- três ADRs propostos para orientar a ponte V1 → V2;
- matriz de testes negativos para a futura validação com banco efêmero;
- critérios de entrada da Janela 1.2.

## Decisão de passagem

A Janela 1.2 pode começar para pesquisa documental e de campo.

Uma revisão independente de segurança não encontrou bloqueador para encerrar esta janela como checkpoint de pesquisa/arquitetura. Antes do fechamento, ela levou a quatro correções:

- QR público passou a ser tratado como token de capacidade, com allow-list, revogação, anti-enumeração e rate limit;
- a projeção V2 → V1 ganhou writer único, ordem, idempotência e gate de cutover;
- CSP gerado localmente deixou de ser apresentado como prova de aplicação no host;
- a outbox ganhou limite de payload, proteção local, retenção, expurgo e exportação segura.

Não estão autorizadas por este checkpoint:

- migrações de schema;
- alteração das políticas RLS;
- atualização das 16 dependências Expo/React Native;
- criação de bucket Supabase;
- deploy, publicação ou escrita em produção;
- ativação de dual-write;
- afirmação de conformidade jurídica ou sanitária.

## Artefatos

- BASELINE.md — estado técnico verificado.
- WORKTREE_SNAPSHOT_2026-08-26_1925.md — caminhos e hashes da árvore de trabalho.
- TENANCY_SYNC_INVENTORY.md — arquitetura atual, lacunas e testes negativos.
- QUOTA_LEDGER.md — envelope planejado e limite de observabilidade.
- ADR-001-PONTE-TENANCY.md — proposta de organization_id e organização ativa.
- ADR-002-SYNC-OUTBOX.md — proposta de comandos idempotentes e conflitos.
- ADR-003-CONVIVENCIA-V1-V2.md — proposta de evolução incremental e rollback.

## Próxima janela

A Janela 1.2 deve pesquisar, com fontes primárias e registro de licença/proveniência:

1. requisitos oficiais aplicáveis a PMOC, contratos, laudos, assinaturas, privacidade e retenção;
2. tarefas reais de prestadores de ar-condicionado e de outras áreas;
3. modelos documentais como referência de campos, nunca para cópia cega;
4. critérios de aceite e descarte para cada artefato.

O conflito documental já observado sobre referências sanitárias, inclusive RE 9/2003 e RDC 886/2024, deve ser resolvido com fonte oficial atual antes de entrar em template ou regra do produto.
