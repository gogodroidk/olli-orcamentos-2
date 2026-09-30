# J2.6 — kernel documental local `quote@1`

Laboratório local, offline e sintético do primeiro núcleo documental do OLLI.
Não é runtime, banco, renderer, PDF, link público, aceite, storage, provider ou produção.

## Contrato

- `quote@1` aceita um rascunho estrito e separa seus campos privados da projeção
  pública; o snapshot publicado é a fonte documental para renderers futuros.
- `olli-document-sha256-v2` usa NFC, UTC com milissegundos, centavos inteiros,
  chaves ordenadas, `evidenceRefs` em ordem normativa, `tenantId` e a referência
  de supersessão/retificação no envelope canônico. A evolução local do contrato
  está registrada em `ADR-004-J2.6-LOCAL-DELTA.md`; hashes `v1` não são
  recalculados nem tratados como compatíveis.
- `publishQuote` é uma simulação pura e atômica de autoridade: capability e tenant
  vêm do contexto confiável; o comando cria versão/evento uma única vez e muda para
  `awaiting_acceptance`.
- O estado, versões e resultados são profundamente congelados. Retificação cria uma
  versão posterior ligada; nunca muda o snapshot/hash anterior.

## Limites explícitos

O módulo não faz I/O, rede, leitura de ambiente, subprocesso, banco, autenticação
real, provider, PDF/HTML, storage, aceite ou link. `context` é uma fixture do
adaptador futuro, não uma sessão de produção.

## Executar

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_6 test
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_6 run coverage
```

As provas são somente locais e sintéticas. O aceite real permanece bloqueado pelos
gates de ADR-004 e da Onda 3.
