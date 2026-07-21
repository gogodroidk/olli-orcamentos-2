# assets/loja — material da ficha da Google Play

Tudo o que dá para produzir **sem a conta da Play** já está aqui. A checklist do dono, em ordem,
está em `docs/ENXAME/LOJA.md`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `FICHA.md` | Título, descrição breve, descrição completa, novidades, categoria. **Texto pronto para colar**, com a tabela de provas (cada afirmação → arquivo do repo onde foi conferida) |
| `PALAVRAS-CHAVE.md` | Como esse público procura na Play, o que a concorrência real usa, e onde cada termo caiu na ficha |
| `SCREENSHOTS.md` | **HISTÓRICO — não siga.** Descreve o caminho antigo (emulador + adb + APK), substituído por `node scripts/telas/loja.mjs`. Continua aqui só pela seção 0, que explica por que o print cru do emulador reprova no upload |
| `FEATURE-GRAPHIC.md` | O que a imagem contém e por quê; zona segura; conformidade de política |
| `CLASSIFICACAO-E-DATA-SAFETY.md` | Respostas do questionário IARC e do formulário de Segurança dos Dados. **Contém 3 divergências com `docs/LOJAS.md`** que precisam ser lidas antes de preencher qualquer coisa |
| `feature-graphic.png` | 1024x500, 24-bit sem alpha — pronto |
| `icone-512.png` | 512x512, 32-bit com alpha — pronto |
| `screenshots/` | **As 8 finais, prontas** — `01-*.png` a `08-*.png`, 1080×1920, mais o `conformidade.json` com o laudo medido de cada uma. Não está vazia e não precisa de emulador para encher |

## Scripts (nenhuma dependência nova — usam o `sharp` de `web/node_modules`)

```bash
node assets/loja/gerar.js               # (re)gera feature-graphic.png e icone-512.png
node assets/loja/medir.js               # confere os limites de caractere lendo o FICHA.md
node assets/loja/palavras.js            # cobertura de palavras-chave na ficha
```

As screenshots NÃO saem daqui. Elas são geradas do app de verdade, por outro pipeline:

```bash
node scripts/telas/loja.mjs                        # as 8 screenshots, do app real, sem emulador
node scripts/telas/medir-ocupacao.mjs              # reconfere quanto de cada tela é fundo vazio
node scripts/telas/gate-privacidade.mjs --conferir # testa o portão de privacidade contra dado plantado
```

⚠️ `medir-ocupacao.mjs` mede o arquivo **emoldurado**, recortado de volta (698×1517); o
`conformidade.json` mede a **captura crua** (1179×2556). A coluna `ocupação` sai mais baixa no
primeiro porque a redução borra texto fino — o **veredito** (oca / não oca) é o mesmo nos dois. O
comando imprime esse aviso sozinho.

`node assets/loja/montar-screenshots.js` ainda existe e ainda funciona, mas é a porta de entrada do
caminho ANTIGO (print cru de emulador → 1080×1920). Não é preciso rodá-lo: `loja.mjs` já entrega o
arquivo final. A moldura de verdade é `scripts/telas/moldura-loja.mjs`, compartilhada pelos dois.

`medir.js` sai com código **1** se algum campo estourar o limite. `loja.mjs`, `medir-ocupacao.mjs` e
`gate-privacidade.mjs --conferir` saem com **1** se alguma imagem reprovar na regra da Play, aparecer
oca, ou se o portão de privacidade estiver cego — os outros são informativos.

**`loja.mjs` não toca esta pasta antes de todos os portões passarem.** As oito imagens ficam em
memória e a pasta só é trocada no fim: uma rodada que produza imagem fora de formato ou tela oca sai
em erro **sem** destruir a leva conforme que está commitada.

## A regra desta pasta

**Nada aqui pode afirmar o que o app não faz.** O produto tem zero usuários: uma promessa falsa na
ficha não vira só reprovação na revisão, vira nota 1 na primeira semana, de quem baixou por causa
dela. Toda afirmação da `FICHA.md` tem a fonte no repositório apontada na tabela de provas — se você
mudar o texto, atualize a prova junto, e rode `medir.js` de novo.
