# assets/loja — material da ficha da Google Play

Tudo o que dá para produzir **sem a conta da Play** já está aqui. A checklist do dono, em ordem,
está em `docs/ENXAME/LOJA.md`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `FICHA.md` | Título, descrição breve, descrição completa, novidades, categoria. **Texto pronto para colar**, com a tabela de provas (cada afirmação → arquivo do repo onde foi conferida) |
| `PALAVRAS-CHAVE.md` | Como esse público procura na Play, o que a concorrência real usa, e onde cada termo caiu na ficha |
| `SCREENSHOTS.md` | Roteiro das 8 telas + comandos exatos de captura. **Leia a seção 0**: o print cru do emulador reprova no upload |
| `FEATURE-GRAPHIC.md` | O que a imagem contém e por quê; zona segura; conformidade de política |
| `CLASSIFICACAO-E-DATA-SAFETY.md` | Respostas do questionário IARC e do formulário de Segurança dos Dados. **Contém 3 divergências com `docs/LOJAS.md`** que precisam ser lidas antes de preencher qualquer coisa |
| `feature-graphic.png` | 1024x500, 24-bit sem alpha — pronto |
| `icone-512.png` | 512x512, 32-bit com alpha — pronto |
| `screenshots/` | Vazio: as finais entram aqui. `screenshots/brutas/` recebe as capturas cruas |

## Scripts (nenhuma dependência nova — usam o `sharp` de `web/node_modules`)

```bash
node assets/loja/gerar.js               # (re)gera feature-graphic.png e icone-512.png
node assets/loja/medir.js               # confere os limites de caractere lendo o FICHA.md
node assets/loja/palavras.js            # cobertura de palavras-chave na ficha
node assets/loja/montar-screenshots.js  # brutas/ 1080x2400 -> finais 1080x1920 com legenda
```

`medir.js` sai com código **1** se algum campo estourar o limite — os outros são informativos.

## A regra desta pasta

**Nada aqui pode afirmar o que o app não faz.** O produto tem zero usuários: uma promessa falsa na
ficha não vira só reprovação na revisão, vira nota 1 na primeira semana, de quem baixou por causa
dela. Toda afirmação da `FICHA.md` tem a fonte no repositório apontada na tabela de provas — se você
mudar o texto, atualize a prova junto, e rode `medir.js` de novo.
