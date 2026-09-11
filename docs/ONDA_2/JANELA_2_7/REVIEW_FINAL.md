# Recibo de revisão independente final — J2.7

Data: 2026-08-30T12:43:11-03:00  
Escopo revisado: `docs/ONDA_2/JANELA_2_6/**`, `docs/ONDA_2/JANELA_2_7/**`
e os controles de continuidade, somente leitura durante a revisão.

## Decisão

**P0=0, P1=0, P2=1 não bloqueante. GO somente LOCAL ONLY.** Esta janela
não é renderer real, PDF/HTML, link, storage, aceite/assinatura real, banco,
provider, runtime ou produção.

## Provas reproduzidas

- `node --check` em `JANELA_2_6/kernel/quote-kernel.mjs` e
  `JANELA_2_7/kernel/acceptance-kernel.mjs`: exit 0;
- J2.6: `npm test` 14/14 e cobertura 100% linhas / 95,15% branches global /
  100% funções;
- J2.7: `npm test` 10/10 e cobertura do kernel 100% linhas / 92,86% branches /
  100% funções;
- regressões locais: J2.1 17/17, J2.3 33/33, J2.4 41/41 e J2.5 57/57;
- sonda adversarial cruzada: combinações de `tenantId`, `draftId`,
  `documentVersionId` e `commandId` válidos `toString`/`constructor` entre
  J2.6 e J2.7 passaram, inclusive replay idêntico;
- as varreduras estáticas dos próprios testes preservam a fronteira local:
  sem filesystem no kernel, rede, subprocesso, ambiente, runtime, Supabase,
  worker, PDF ou HTML.

## Invariantes confirmados

- J2.6 e J2.7 usam índices internos sem protótipo e `Object.hasOwn`, evitando
  replay, versão ou rascunho ficticiamente existentes para IDs contratuais;
- `renderFixture` recebe somente a projeção já verificada de `publicVersion` e
  produz artefato sanitizado/determinístico de teste;
- aceite/recusa exigem tenant, actor/capability, versão, hash, prazo, estado e
  idempotência coerentes antes de criar evento append-only;
- sucessora só é decidida após vínculo de retificação; versão substituída não
  recebe decisão posterior; retificação preserva decisão anterior e recusa
  sucessora já decidida;
- nenhum teste ou kernel amplia o escopo para dados reais ou serviços externos.

## P2 diferido, não bloqueante

O teste durável J2.7 fixa chaves especiais de `commandId`, enquanto a revisão
adversarial também exercitou `tenantId` e `documentVersionId`. A mesma proteção
estrutural cobre os índices e a sonda passou; registrar explicitamente aqueles
dois casos na suíte permanece melhoria futura de regressão, sem defeito atual.

## Snapshot revisado

| arquivo | SHA-256 |
|---|---|
| `README.md` | `37548d2e8a11189a4c692d4d357ec2de1b01af2c98989fd4d0021a1636cb91b1` |
| `fixtures/synthetic.mjs` | `f09ddd0b89cf8bcde78fadab2a7fda772cd339285ed59cbed05c5f5115a70eb6` |
| `kernel/acceptance-kernel.mjs` | `d87e82bd756d2ad011a4409d57d8f66ab6d7455ed6b8f8480b1233d3f8e693dc` |
| `package.json` | `071ef94a9319513236bfa204c70eda77067b3f07809a24b4aebf04ca54c86819` |
| `tests/acceptance-kernel.test.mjs` | `9a5540b5eada403d6f1ce9fd05ecb1098f3a9553f7ec0a45cccf0299240ed49c` |
