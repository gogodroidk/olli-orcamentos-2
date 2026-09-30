# Resultados — J2.7, renderer fixture e decisões documentais locais

Status: **FIM DONE somente local/offline/sintético**  
Data: 2026-08-30T12:43:11-03:00

## Entrega comprovada

J2.7 acrescenta ao snapshot documental congelado J2.6 um renderer fixture
determinístico baseado somente na projeção pública e uma máquina local de
aceite, recusa e retificação. Cada decisão é presa ao `documentVersionId` e ao
`canonicalHash` exatos; eventos são append-only e idempotentes por tenant.

## Validação

- J2.7: 10/10 testes; cobertura 100% linhas, 92,86% branches e 100% funções;
  `node --check` verde.
- Dependente J2.6: 14/14 testes; cobertura 100% linhas, 95,15% branches global
  e 100% funções; `node --check` verde.
- Regressões J2.1/J2.3/J2.4/J2.5: 17/33/41/57 verdes.
- Revisão independente final: P0=0, P1=0, P2=1 não bloqueante, detalhada em
  `REVIEW_FINAL.md`.

## Limites preservados

Não há renderer real, PDF/HTML publicado, link/token, upload, storage, banco,
provider, assinatura, aceite real, runtime, rede, ambiente, subprocesso,
credencial, dado real, migration, deploy ou produção. Esta prova local não
substitui fonte autoritativa, assinatura, autenticação real, RLS, retenção ou
aceite jurídico/comercial.

## Pendência registrada

Em uma janela futura de hardening, tornar duráveis na suíte J2.7 os cenários de
`tenantId` e `documentVersionId` com `toString`/`constructor`; a sonda
independente atual já passou e não existe defeito aberto.

Snapshot e evidência de revisão: `REVIEW_FINAL.md`.
