# Gate 1.4 — decisão final da arquitetura local

Data: **2026-08-28**  
Decisão: **GO ARQUITETURA LOCAL COMPLETA; GO ONDA 2 SOMENTE PARA SCHEMAS/FIXTURES/BANCO EFÊMERO; NO-GO PARA RUNTIME REMOTO, DADO REAL E PRODUÇÃO**

## 1. O que esta janela decidiu

- direção de tenancy por organização e autorização fail-closed;
- separação entre RBAC da empresa cliente e administração interna do SaaS;
- Postgres canônico + SQLite operacional offline-first;
- outbox/comandos por fatia, idempotência e conflito explícito;
- V1/V2 com um writer por agregado e feature flag por organização;
- kernel documental por schema/version/snapshot/hash/eventos;
- storage privado com digest servidor e referências fora da outbox;
- preço V1 apenas com dados da própria organização;
- IA como sugestão allowlistada, sem ação autônoma;
- primeira fatia de Onda 2 e DoD mensurável;
- plano de migration/rollback e ameaças obrigatórias.
- canonicalização/hash documental `olli-document-sha256-v1`, publicação/aceite transacionais e retenção imutável;
- fluxo único de autorização sessão → membership → capability → recurso → atributos → RPC/RLS/Storage;
- cálculo monetário versionado/reprodutível e bloqueio técnico de analytics cross-org;
- egress de IA apenas server-side/allowlistado, com quota, fallback, circuit breaker e aprovação humana;
- auditoria mínima, kill switches e testes negativos normativos por ADR.

## 2. O que não está aceito

- promover os ADRs 001–003 para operação real sem catálogo/backfill/RLS/rollback comprovados;
- aplicar migrations ou policies;
- copiar spikes J1.3 diretamente para o runtime;
- criar bucket/storage real;
- conectar provider externo de IA/assinatura;
- usar dados de empresas para benchmark coletivo;
- afirmar validade jurídica, conformidade PMOC/ABNT/ANVISA/ART;
- deploy, build pública, cobrança ou dado real.

## 3. Próxima etapa autorizada da Onda 2 local

1. Criar contratos machine-readable/schemas e fixtures sintéticas do Incremento A: organização → cliente → local → comando idempotente.
2. Transformar as matrizes normativas em testes executáveis por ator, tenant, recurso, estado e revogação.
3. Escrever migration draft aditiva e rollback, sem aplicação remota.
4. Executar migration/RLS/RPC somente em banco efêmero descartável com dois tenants e dados sintéticos.
5. Registrar resultados, falhas, rollback e próximos gates sem promover fixture a prova de produção.

Essa autorização não inclui integração dos spikes ao produto, alteração de `src/**`, Supabase remoto, Storage real, Worker, provider externo, tela, build, deploy ou publicação.

## 4. Gates humanos/externos

- autenticação controlada e catálogo do Supabase;
- matriz final de capacidades validada com prestadores;
- revisão jurídica/privacidade/RT e licença normativa quando aplicável;
- provider/conta/credencial, serviço pago e configuração de egress;
- teste em dois dispositivos/organizações e aparelho físico;
- autorização de migration, deploy e produção.

## 5. Critério para promover além do laboratório local

Qualquer `GO runtime/piloto` exige:

- ADRs locais reconciliados e revisão independente sem P0 aberto;
- schemas/fixtures do Incremento A validados;
- migration e rollback aprovados em ambiente efêmero;
- testes negativos de tenancy/autorização/idempotência executados e verdes;
- nenhuma contradição entre writer V1/V2, documento imutável, storage e egress;
- lista humana única para os gates externos restantes.

Até lá, a decisão permanece **GO arquitetura e laboratório local / NO-GO runtime, remoto, dado real e produção**.
