# J2.7 — renderer fixture e decisões documentais locais

Laboratório local, offline e sintético que consome a versão congelada da J2.6.
Não produz HTML/PDF, link público, aceite jurídico, assinatura, upload, storage,
banco, runtime, provider ou produção.

## Contrato

- `renderFixture(version)` só recebe a versão J2.6 verificada e devolve uma
  projeção determinística rastreável por `documentVersionId` e `canonicalHash`.
- `recordAcceptance` e `recordRejection` exigem tenant/capability confiáveis,
  versão/hash exatos, estado `awaiting_acceptance`, prazo válido e idempotência
  por tenant; os eventos são append-only no estado puro.
- `recordRectification` vincula a nova versão ao mesmo orçamento, preserva a
  decisão anterior e impede nova decisão na versão substituída.

## Executar

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_7 test
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_7 run coverage
```

Tudo é fixture sintética local. Aceite real e renderer/publicação continuam
gates separados da Onda 3.
