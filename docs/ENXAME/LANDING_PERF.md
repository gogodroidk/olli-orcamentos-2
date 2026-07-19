# LANDING — desempenho e o robots que se contradiz (19/07/2026)

> Medições feitas contra **produção** (`https://olliorcamentos.online`), não contra
> build local. Onde a magnitude não foi reproduzida por um segundo medidor, está
> escrito que não foi.

---

## §A1 — A política de crawler de IA vale por acidente, não por escolha

**Gravidade: média · quem resolve: o dono, no painel da Cloudflare · não tem conserto por código**

O `web/public/robots.txt` do repositório libera tudo (`User-agent: *` → `Allow: /`).
O que **produção serve** tem 1.919 bytes: a Cloudflare injeta na borda, **antes** do
conteúdo do repo, um bloco `# BEGIN Cloudflare Managed content` com `Disallow: /`
para nove crawlers de IA — GPTBot, ClaudeBot, CCBot, Google-Extended,
meta-externalagent, Bytespider, Amazonbot, Applebot-Extended,
CloudflareBrowserRenderingCrawler — mais `Content-Signal: search=yes,ai-train=no,use=reference`.

**Por que não dá para resolver no código.** A hipótese testada era: o worker que
serve a landing poderia interceptar `/robots.txt` e devolver o do repositório.
Testado contra um worker **com script** (`diagnostico.olliorcamentos.online`), que
responde 405 em qualquer GET fora da lista de rotas: mesmo ele devolve **200** no
`/robots.txt`, com o bloco gerenciado. **A borda atende antes de o worker rodar.**

**Por que importa.** Busca comum não foi afetada — o grupo `*` segue `Allow: /`, e
SEO está intacto. Mas pela RFC 9309 §2.2.1 o crawler obedece ao grupo que casa com
o *product token* dele; o `*` só vale quando **nenhum** token casa. Então o GPTBot lê
`Disallow: /` e nunca chega no `Allow: /`.

E o site publica `/llms.txt` (200, 3.492 b) — arquivo cuja única razão de existir é
ser lido por assistente de IA. **O mesmo domínio serve o convite e a proibição.**

**A decisão é sua, não um conserto.** Bloquear treino de IA é postura legítima; o
problema é que hoje ela vale **por padrão, sem ninguém ter escolhido**, e contra a
estratégia de GEO escrita nos documentos do próprio projeto. A chave está em
Cloudflare → Security → Settings (a opção de bloquear treino de IA no robots.txt).

---

## §A2 — 16 imagens `@2x` pagavam um redirect a mais em tela retina — **CORRIGIDO**

Defeito medido em produção: `/telas/agenda@2x.avif` → **307**, com
`Location: /telas/agenda%402x.avif`; a URL canônica → **200, 30.600 b**.

O `@` no nome do arquivo não estava percent-encoded no `srcset`, então **toda tela
retina** (a maioria dos celulares) pagava um salto extra por imagem, 16 vezes.

Corrigido com `encodeURIComponent` no gerador de URL — que produz exatamente o
`Location` canônico da própria Cloudflare, e de quebra escapa a vírgula, que é o
separador de candidatos dentro de `srcset`.

**Prova (mutation check):**

| | `@2x` cru | `%402x` |
|---|---|---|
| `index.html` em produção (build antigo) | **16** | 0 |
| `dist/index.html` novo | **0** | **16** |

Muda byte entregue, não é cosmético.

⚠️ **Magnitude não confirmada.** O implementador reportou 4.089 ms → 1.925 ms em
4G lento com CPU 4×. O revisor não conseguiu reproduzir o trace com throttling e
**não confirmou o número**. A direção é certa (16 redirects a menos) e a identidade
de bytes é estruturalmente sólida — os arquivos são os mesmos, só a codificação da
URL muda. O ganho exato fica em aberto.

---

## §A3 — `/telas/*` sem política de cache — **CORRIGIDO**

Medido antes: `/telas/agenda.avif` respondia `Cache-Control: public, max-age=0, must-revalidate`.
Cada visita repetida revalidava as 8 imagens.

A pergunta que precisava de resposta empírica era outra: **o `_headers` realmente
sobrescreve o `Cache-Control` neste deploy?** Provado sem confiar em documentação —
`/_astro/Layout.8k-O501k.css` em produção devolve `max-age=31536000, immutable`, ou
seja, uma regra `_headers` já existente vence o mesmo default. Logo a regra nova pega.

Política escolhida: **1 dia + stale-while-revalidate**, deliberadamente conservadora.
Não subiu para `immutable` porque o nome do arquivo **não tem hash** — se as telas
forem recapturadas, um visitante recorrente veria a versão velha.

⚠️ **Consequência a saber:** com a tarefa de recaptura das telas ainda pendente, uma
recaptura levaria até ~2 dias para chegar a quem já visitou. Aceitável, mas é troca
declarada, não acidente.

---

## O que NÃO foi medido

Nenhum fluxo autenticado (não digitamos senha). O trace com throttling de rede e CPU
foi feito por um medidor só, e o segundo não reproduziu — os números de milissegundo
deste documento valem como indicação, não como fato estabelecido.
