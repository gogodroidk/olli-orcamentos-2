# Prédio visual — 3 andares

Página local da Direção de Arte (item Z-06). Mostra o 3º andar GR Tech, o 2º OLLI Serviços e o 1º OLLI Orçamentos. Cada pessoa fica na própria mesa, com foto se o arquivo existir, balão da tarefa e o estado escrito (não só a cor).

Não chama modelo nenhum. Não entra no app, no worker nem na pasta do site. Não publicar.

## Como abrir

Na pasta `ops/predio-visual`, junto de `estado.json` (o mesmo contrato de `atualizado`, `agentes`, `conversas`) e, se quiser as fotos, a pasta `rostos/` com os `.webp` já existentes:

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8766/`. Sem `estado.json`, a página diz "sem sinal" e deixa a sala em montagem. Não inventa pessoas.

O mapa `andares.json` é provisório. Área que não estiver nele aparece em "Fora do mapa".

A primeira leitura não solta aviãozinho para conversa antiga. Conversa nova, depois disso, desenha o avião (só `transform` e `opacity`) e escreve quem falou com quem. Com `prefers-reduced-motion: reduce`, o avião e o balanço dos braços ficam parados; o texto continua.

No celular, um andar por vez, pelas abas.

## Teste

```bash
npm run test:predio-visual
```

## O que esta pasta não faz

Não substitui o `predio.html` que já está no cérebro. Aquele continua com as áreas antigas. Trocar o arquivo ao vivo é outro passo, fora deste repositório.
