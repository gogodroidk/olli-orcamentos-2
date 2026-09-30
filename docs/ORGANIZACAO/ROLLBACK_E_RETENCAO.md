# Rollback e retenção da organização

Este runbook cobre somente as alterações de organização de 2026-09-03. Ele não
é autorização para apagar projetos, junction targets ou material histórico.

## O que foi preservado

- raiz Google Drive;
- `C:\OLLI_REL` e seu Git;
- checkout-base/Git common-dir;
- clones divergentes;
- base HVAC;
- projetos auxiliares;
- campanha;
- cópia estática e ZIP do hub;
- todas as junctions e seus targets.

## Renomeações/movimentos previstos

| Antes | Depois | Natureza |
| --- | --- | --- |
| `Desktop\OLLI ORCAMENTOS V1` | `Desktop\OLLI - CENTRAL DO PROJETO` | Rename do contêiner do hub |
| `Desktop\2 PESSOAL\OLLI ORCAMENTOS V1` | `Desktop\_Arquivo OLLI\HUB OLLI DUPLICADO ESTATICO 2026-08-30` | Arquivamento reversível |
| `Desktop\2 PESSOAL\OLLI ORCAMENTOS V1 zipp.zip` | `Desktop\_Arquivo OLLI\HUB OLLI DUPLICADO ESTATICO 2026-08-30.zip` | Arquivamento reversível |
| `Desktop\OLLI - CENTRAL DO PROJETO` | `Desktop\OLLI Orçamentos Master` | Promoção do mesmo hub em 2026-09-22; o nome anterior vira junction de compatibilidade |

## Como desfazer com segurança

1. Pare qualquer processo que esteja usando o hub.
2. Execute primeiro `VALIDAR_ORGANIZACAO.ps1` e registre o resultado.
3. Confirme que os caminhos de destino antigos não existem.
4. Use `Move-Item -LiteralPath` apenas nos três pares exatos acima, em ordem
   inversa.
5. Atualize `expectedHub` nos dois scripts administrativos.
6. Remova somente as três junctions adicionais usando
   `[IO.Directory]::Delete(path, $false)`, após confirmar
   `LinkType=Junction`.
7. Nunca use `Remove-Item -Recurse` no hub.
8. Rode o validador antigo/ajustado e confira Git/Drive.

O script histórico `00_ADMIN\ROLLBACK_HUB.ps1` remove apenas junctions e o
atalho do APK, mas continua sendo uma ação manual de alto impacto. Use
`-WhatIf` e `-Confirm`; a automação não o executa.

Para desfazer somente a promoção de nome de 2026-09-22, use primeiro
`00_ADMIN\ROLLBACK_NOME_MASTER.ps1 -WhatIf`. Ele remove apenas a junction de
compatibilidade e renomeia o contêiner de volta, sem tocar nas origens.

## Retenção

A cópia estática foi arquivada, não deletada. Ela só poderá ser removida em uma
tarefa separada depois de:

- prazo de retenção definido pelo dono;
- comparação de hashes;
- confirmação de que não há arquivo exclusivo;
- backup recuperável;
- autorização explícita para exclusão.
