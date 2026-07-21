# FEATURE GRAPHIC + ÍCONE DA LOJA — o que foi gerado e por quê

## Arquivos prontos (gerados, não descritos)

| Arquivo | Especificação medida | Exigência da Play |
| --- | --- | --- |
| `feature-graphic.png` | **1024x500**, 3 canais, `alpha=false`, 165 KB | 1024x500, JPEG ou PNG 24-bit **sem** alpha ✅ |
| `icone-512.png` | **512x512**, 4 canais, `alpha=true`, 48 KB | 512x512, PNG 32-bit **com** alpha, ≤ 1024 KB ✅ |

Regerar a qualquer momento: `node assets/loja/gerar.js` (usa o `sharp` que já existe em
`web/node_modules` — nenhuma dependência nova foi instalada). O script imprime as dimensões, os
canais e o alpha de cada saída, então a conformidade é conferida toda vez, não presumida.

> **Repare que as duas exigências de alpha são OPOSTAS.** O ícone precisa de alpha; o feature graphic
> não pode ter. É o erro mais comum desse pacote e não dá aviso amigável — a Console só recusa.

### O ícone precisava de conserto, não só de redimensionar

Medido com sharp: `assets/icon.png` tem **3 canais e `hasAlpha=false`**. Um resize puro herdaria
isso e produziria um PNG de 24 bits — exatamente o que a Play recusa no campo do ícone. Por isso o
`gerar.js` chama `.ensureAlpha()`. Conferido depois: os cantos saem opacos no azul-marinho da marca
(`10,37,71` = `#0A2547`), ou seja, a arte é full-bleed e a Play pode aplicar a máscara de canto
arredondada dela por cima sem criar borda transparente esquisita.

---

## O que a imagem contém (e o raciocínio de cada escolha)

Composição, da esquerda para a direita:

1. **Fundo** azul-marinho da marca (`#0A2547` → `#081C36`) com um brilho radial azul no alto à
   esquerda e um eco ciano embaixo à direita. Faixa diagonal a 3% de branco, **com as pontas
   esmaecendo** — na primeira renderização ela tinha opacidade chapada e virava uma costura reta
   visível no meio da arte.
2. **Marca**: o mark do OLLI (o mesmo path de `web/public/favicon.svg` e `OlliLogo.astro`, não um
   desenho novo) + o wordmark `OLLI`.
3. **Headline em duas linhas**: `Orçamento pronto` / `ainda no cliente` — a segunda linha no
   gradiente ciano→azul da marca. Cinco palavras, dentro da faixa de 5-7 que sobrevive à miniatura.
4. **Subline**: `Orçamentos · Recibos · Ordens de serviço` — os três documentos que o app realmente
   emite. Nada de feature que não existe.
5. **Arte à direita**: um documento inclinado com cabeçalho na cor da marca, linhas de item
   abstratas, a barra de total (o mesmo padrão do PDF real do app) e **a assinatura do cliente feita
   à mão**, com o selo verde de aprovado. É a promessa do produto em uma imagem: orçamento →
   assinado → aprovado.

### Duas coisas foram consertadas depois de olhar o resultado

Gerar e assumir que ficou bom é como escrever contagem de caractere de cabeça. As duas correções
saíram de inspecionar o PNG renderizado:

- **A "assinatura" era uma senoide.** O primeiro traçado tinha ondas regulares e lia como gráfico,
  não como alguém assinando. Refeito com laçada inicial, descida abaixo da linha e rubrica de saída.
- **A arte furava a própria margem de segurança.** O card e o selo verde estavam a ~46-62px da borda
  direita, enquanto este documento promete 72px. Movidos para a esquerda até respeitarem de fato.

### Zona segura

Superfícies da Play **cortam as bordas** do feature graphic e, quando existe vídeo promocional,
sobrepõem um botão de play grande no centro. Regras seguidas:

- Nada essencial a menos de **72px** de qualquer borda (conferido depois do ajuste acima).
- Canto inferior direito deliberadamente calmo.
- ⚠️ **Este layout pressupõe que NÃO há vídeo promocional.** Se o dono adicionar um vídeo do YouTube
  na ficha, o botão de play cobre a região central e vale reavaliar a composição.

### Legibilidade na miniatura — conferida, não presumida

O feature graphic aparece reduzido na maior parte das superfícies. Renderizado a **392px de largura**
(tamanho típico na listagem): a headline continua perfeitamente legível, a subline permanece
legível, e a marca e a arte continuam identificáveis. Menor corpo de texto na arte: 27px em 1024 de
largura.

### Conformidade de política

A política de metadados proíbe, no título/ícone/nome do desenvolvedor, alegação de desempenho ou
ranking e informação de preço ou promoção; e proíbe símbolos enganosos no ícone. Esta imagem:

- não diz "nº 1", "melhor", "mais usado" — **o app tem zero usuários**;
- não traz preço, "grátis", "desconto" nem contagem regressiva;
- não imita notificação, selo de sistema ou botão falso;
- não usa emoji, ALL CAPS nem caractere especial repetido;
- não usa depoimento nem nota de avaliação.

---

## Se um dia quiser trocar a arte

Edite `svgFeatureGraphic()` em `assets/loja/gerar.js` e rode de novo. Tudo é SVG vetorial renderizado
na hora — não há PSD, não há upscale, e a marca vem do mesmo path do site, então logo do site e logo
da loja não podem divergir sem alguém mexer nos dois.

Regras que a próxima versão precisa manter: 1024x500 exatos · sem alpha · headline de 5-7 palavras ·
72px de margem · nada de preço/ranking/depoimento · **olhar o PNG antes de aprovar**, inclusive
reduzido a ~390px.
