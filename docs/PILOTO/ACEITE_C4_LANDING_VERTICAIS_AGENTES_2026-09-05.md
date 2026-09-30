# Aceite local C4 — landing, verticais e descoberta por agentes

Data: **2026-09-05**  
Checkout canônico: `C:\OLLI_REL`  
Branch: `Codex/piloto-p0`

Revalidação: **2026-09-06** — landing recompilada e auditada nas rotas públicas
principais em viewport móvel e desktop.

## Resultado

A landing passa a apresentar a OLLI como plataforma de orçamentos para qualquer
negócio de serviço, mantendo páginas específicas para climatização, elétrica,
hidráulica, pintura, dedetização e jardinagem. Ofícios fora do catálogo têm uma
rota honesta própria: `/para/prestador-de-servico/`.

As capturas da esteira são identificadas como telas reais da operação no celular
e no computador, com dados de demonstração. A copy não chama essas telas internas
de “tela do cliente”; informa que a tela pública nasce no link de aprovação.

## Descoberta e trust

- O `llms.txt` lista as seis verticais e também a rota genérica, com contagens
  derivadas do mesmo catálogo usado pelo app.
- `BreadcrumbList`, `FAQPage`, `Organization`, `WebSite` e
  `SoftwareApplication` continuam sendo gerados a partir do conteúdo renderizado
  e das fontes de preço/produto.
- Rotas utilitárias não entram no sitemap; `/admin/` e `/404/` também são
  desestimuladas no `robots.txt`.
- A área administrativa continua protegida e noindex; publicação de WAF, DNS e
  regras de borda permanece fora do escopo local.

## Evidência externa fornecida pelo usuário

Os prints de **04/09/2026** mostram:

- Ora: **54/100**, com observação de que há política de rastreamento em
  `robots.txt`, mas não suporte WebMCP.
- Is Agentic: **49/100**, com **2 de 7** verificações essenciais e **5 de 9**
  recomendadas aprovadas.

Esses números são snapshots de terceiros, não uma reexecução feita neste turno.
Eles orientam o backlog de WAF/WebMCP e legibilidade de agentes, mas não são
apresentados como garantia de comportamento em produção.

## Evidências locais

- `npm run test:landing-c4` — passou.
- `npm run build` em `web` — passou; **25 páginas** estáticas geradas,
  incluindo `/para/prestador-de-servico/`.
- O `sitemap-0.xml` gerado contém a rota genérica e não contém `admin`, `404` ou
  `excluir-conta`.
- `git diff --check` — passou (avisos restantes são apenas normalização
  automática LF/CRLF do Git no Windows).
- Auditoria renderizada confirmou `lang`, title, description, OG, H1 único,
  alt e dimensões em todas as imagens, ausência de overflow e console limpo;
  links de navegação, rodapé, breadcrumbs e chips de ofício usam área de toque
  mínima de 44 px. O skip-link e inputs `sr-only` são as únicas exceções
  intencionais.

## Limites da prova

Não houve deploy, alteração de DNS/WAF, publicação, cadastro de domínio ou teste
com crawler externo ao vivo. O próximo salto de confiança exige reexecutar Ora e
Is Agentic após a publicação autorizada e validar o comportamento de bots na
borda real.
