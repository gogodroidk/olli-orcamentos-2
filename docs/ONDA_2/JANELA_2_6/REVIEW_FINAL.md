# Recibo de revisão independente final — J2.6

Data: 2026-08-30T07:55:38-03:00  
Escopo revisado: `docs/ONDA_2/JANELA_2_6/**` e ADR-004 pai, somente leitura.

## Decisão

**P0=0, P1=0, P2=1. GO somente LOCAL ONLY.** A janela não é runtime,
banco, renderer, storage, aceite real, migration, dado real ou produção.

## Provas reproduzidas

- `npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_6 test`: 13/13;
- `npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_6 run coverage`:
  100% linhas, 95,70% branches global (95,60% no kernel), 100% funções;
- `node --check kernel\quote-kernel.mjs`: exit 0;
- regressões locais: J2.1 17/17, J2.3 33/33, J2.4 41/41, J2.5 57/57;
- casos adversariais em memória: ordem `evidence.B`, `evidence.Z`,
  `evidence.a`; adulteração isolada de tenant; replay de ator/evento divergente
  e origem adulterada de retificação: todos falharam fechado quando aplicável.

## Achados corrigidos e limites

- `tenantId` integra o envelope `olli-document-sha256-v2`; a evolução e a
  incompatibilidade deliberada com `v1` estão limitadas pelo ADR local.
- intenção idempotente vincula ator e evento; `eventId` e namespace de comando
  continuam isolados por tenant.
- `evidenceRefs` usa comparação ASCII por code point, sem `localeCompare`.
- P2 diferido, não material para `quote@1`: `canonicalize()` genérico compara
  unidades UTF-16 em chaves Unicode não ASCII. As chaves e IDs normativos da
  fatia são ASCII allowlistados. Antes de reutilização genérica, implementar
  comparação por scalar code point ou restringir formalmente o domínio.
- Hash sem chave não substitui fonte autoritativa, assinatura, storage ou RLS;
  todos continuam gates de janela futura/produção.

## Snapshot revisado

| arquivo | SHA-256 |
|---|---|
| `ADR-004-J2.6-LOCAL-DELTA.md` | `ad66a6c19bb91f295d5259e31e9d385ebab1b9fee4fc317d301c6cb48b573a16` |
| `fixtures/synthetic.mjs` | `5301871c7cf91adc670a9e389b5ca650d9656c50ab9919c7733f2f030de68d3b` |
| `kernel/quote-kernel.mjs` | `a8157be1f2af13e6efc4668aa1c0335f1bacbf6cf403eec37b088c30a1842efc` |
| `package.json` | `b382e183525324416b18714c34ef85e07440dfb65c715e2cf53f89740b0130d1` |
| `README.md` | `6e47f8f1f0506b09770f96974855f8e53cbdbaf0a5be80a5bade5cebad3afd89` |
| `tests/quote-kernel.test.mjs` | `f7dc11ba0c0e3e36ef9d2e00a195cefeba3130baaedc76cfd3324f52af0ea522` |
