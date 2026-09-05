# Nomenclatura e governança de arquivos OLLI

## Marca

- Nome público: **OLLI Orçamentos**.
- Nome curto interno permitido: **OLLI**.
- Não usar “Wally”, “Walli”, “Holly”, “Oli” ou variantes como marca.
- Antes de publicar qualquer peça, validar a grafia `OLLI`.

## Nomes das raízes

| Nome | Significado |
| --- | --- |
| `C:\OLLI_REL` | Código canônico |
| `OLLI - CENTRAL DO PROJETO` | Hub de navegação |
| `OLLI ORCAMENTOS` | Raiz legada do Google Drive; nome preservado por sincronização |
| `HUB OLLI DUPLICADO ESTATICO AAAA-MM-DD` | Cópia congelada, não canônica |
| `_Arquivo OLLI` | Retenção histórica |

Não criar novas pastas chamadas apenas `OLLI`, `OLLI ORCAMENTOS V2`,
`OLLI FINAL`, `OLLI NOVO` ou `OLLI CERTO`. Para novas iniciativas, usar:

`OLLI_<AREA>_<TIPO>_<AAAA-MM-DD>`

Exemplos:

- `OLLI_MARKETING_CAMPANHA_2026-09-03`;
- `OLLI_QA_ANDROID_2026-09-03`;
- `OLLI_PESQUISA_HVAC_2026-09-03`.

## Documentos

- Documento atual: nome sem “FINAL”; a fonte de verdade é indicada pelo índice.
- Snapshot: sufixo `AAAA-MM-DD`.
- Histórico append-only: nunca reescrever eventos anteriores.
- Resultado de teste: declarar ambiente e limite, por exemplo
  `LOCAL_ONLY_SYNTHETIC`, `SANDBOX` ou `ACCEPTED_REAL`.
- Ideias futuras ficam em `docs/ideias-futuras` e não entram no roadmap até
  decisão explícita.

## Estados oficiais

| Estado | Significado |
| --- | --- |
| `planned` | Ainda não iniciado |
| `ready` | DoD e allowlist definidos; sem gate pendente |
| `running` | Lease válida e trabalho em curso |
| `done_local_only` | Implementado e provado localmente |
| `blocked_human` | Precisa de decisão, credencial, dado, ambiente ou aceite |
| `accepted_real` | Aceite comprovado no ambiente correto |
| `archived` | Preservado, fora da execução |

## Regras para mover ou renomear

1. Inventariar origem, destino, bytes, hashes e reparse points.
2. Verificar que o destino exato não existe.
3. Nunca seguir junctions durante inventário/remoção.
4. Não mover Git common-dir, raiz Drive, secrets, sessões ou builds em uso.
5. Atualizar todas as referências conhecidas.
6. Validar antes e depois.
7. Registrar rollback exato.
8. Não apagar a origem histórica na mesma fatia.

## Fonte única

Um “ponto único” significa navegação e governança únicas, não copiar gigabytes
para uma pasta. A central usa junctions para preservar os caminhos dos quais
Git, Drive e ferramentas dependem. Isso evita duplicação, quebra de sync e perda
de histórico.

