# Análise — Design (Claude Design) × App construído

> Comparação completa entre o **handoff de design** (`OLLI Handoff`, 12 telas feitas no Claude Design) e o **código já construído** (app Expo + painel web + worker do link + PDF).
> Feita com 4 agentes em paralelo (leitura do código-fonte do design, que é a fonte da verdade) + verificação visual dos 12 prints renderizados.
> Data: 2026-06-17.

## Veredito rápido (fidelidade por superfície)

| Superfície | Fidelidade hoje | Resumo |
|---|---|---|
| **Marca — cores & logo** | ✅ ~95% | Paleta exata em hex; monograma "O" 1:1. |
| **Marca — tipografia** | 🟡 ~55% | Plus Jakarta ok; **falta a fonte Spectral** (valores/títulos). |
| **Marca — mascote & animações** | 🟡 ~60% | Robôzinho com olhos quadrados (deviam ser redondos) e cabeça em gradiente (devia ser chapada); faltam animações "premium" (sheen, splash, voz, pop). |
| **App mobile** | 🟡 ~35% | Núcleo de orçamentos ok; **faltam blocos inteiros**: Agenda, OLLI Voz, Equipe, Hoje, Financeiro, Planos, Chat, Notificações, telas de campo. Navegação diverge (4 abas × 5 do design). |
| **Painel web** | 🔴 ~20% | **Tema claro placeholder** vs design **escuro cockpit**. Faltam Agenda, Equipe (mapa ao vivo) e Financeiro; Dashboard e cadastro muito aquém. **Superfície menos fiel.** |
| **Link do cliente** | 🟡 ~55% | Aprova/recusa funciona; falta a identidade (faixa azul, total Spectral, mini-cards, **tela de sucesso animada**), e o snapshot não manda alguns dados. |
| **PDF do orçamento** | 🟡 ~50% | Gera PDF completo, mas estética "comercial/densa" vs o design "premium/minimalista"; cor **hardcoded** (devia ser a cor da marca configurável), sem Spectral, layout de tabela/total diferente. |

**Em uma frase:** o **DNA da marca está fiel** (cores, logo) e o **núcleo de orçamentos funciona**, mas o app construído é hoje **~1/3 do design** — faltam telas grandes, o **painel web precisa virar escuro**, e há **2 ajustes de marca baratos e de alto impacto** (fonte Spectral + olhos do mascote).

---

## 1. Marca / Design System

### Cores — ✅ fiel
Núcleo 100% igual em hex: Azul `#0B6FCE`, Ciano `#34C6D9`, Ciano claro `#7FE9F5`, Profundo `#0A2540`, Fundo escuro `#0A1626`, Sucesso `#2BD787`, Erro `#FF6B6B`, Aviso `#F7B23B`.
Faltam só cores acessórias: WhatsApp `#25D366`, roxo de planos `#7C3AED`, lilás de avatar `#A4B6F5`, ink `#16202E`, família de cinzas "slate", variantes de texto de status sobre escuro. — *Esforço: Pequeno.*

### Tipografia — 🟡 falta Spectral
O design usa **duas** fontes: **Plus Jakarta Sans** (interface) **+ Spectral** (serifada, em **todo valor R$** e títulos de sucesso "Orçamento aprovado!"). O app hoje carrega **só Plus Jakarta**. Pesos de H2/H3/botão estão um grau abaixo (700/600 vs 800 do design). — *Esforço: Pequeno–Médio. Alto impacto.*

### Mascote — 🟡 ~60%
`OlliMascot.tsx`: olhos **retângulos** (design = **círculos** r≈3.4), cabeça com **gradiente** (design = **chapada** `#0B6FCE`/`#34C6D9`), visor translúcido/menor (design = **sólido `#0A2540`** maior). Logo/monograma (`OlliLogo.tsx`) é **1:1** ✅. — *Esforço: Pequeno. Alto impacto (é o rosto da marca).*

### Gradientes & sombras — 🟡
Gradiente-assinatura azul→ciano ok. Ajustar: hero/splash deve ser `#0B6FCE→#0A2540` puro (hoje tem um `#1486E6` a mais); faltam gradientes translúcidos de card, o `90°` azul→frost, o **sheen**, e os **glows coloridos** (ciano/azul) + anel de foco frost — responsáveis pelo brilho premium. — *Esforço: Pequeno–Médio.*

### Animações — 🟡
Tem: float, entrada em cascata, blink (aproximado). Faltam: `sheen`, `ringSpin` (splash girando), `ringGlow`, `olliPulse` (status "ao vivo"), `wave`/`ripple` (assistente de voz) e `pop` (sucesso). — *Esforço: Médio.*

---

## 2. App mobile

### Navegação — diverge
- **Design (5 abas):** Início · Agenda · **＋Orçamento** (botão central elevado) · Hoje · Conta.
- **App (4 abas):** Início · Diagnóstico · Orçamentos · Catálogo.
- Faltam abas **Agenda**, **Hoje** e o **botão central ＋**; **Conta** virou tela de login/backup (no design é o hub com PRO, perfil, notificações e ferramentas).

### Telas que FALTAM (no design, ausentes no app)
Grandes: **Agenda** (dia/semana/mês), **OLLI Voz** (tap-to-talk monta orçamento), **Hoje/"Meu dia"**, **Equipe** (status ao vivo), **Financeiro**, **Rota do dia**, **Planos & assinatura** + **Pagamento**, **Chat com a OLLI**, **Notificações**.
Menores: Capturar assinatura, Agendar visita, Adicionar despesa, Detalhe do técnico, Relatórios, Avaliação do cliente, Recuperar senha, Onboarding/Primeiro uso, Configurações, Modelos de orçamento, tela Offline, card OLLI PRO/Indique e ganhe.

### Telas que existem mas DIVERGEM
- **Início:** "próxima parada" é empty-state (design = card vivo com anel "saia em X min" + Iniciar rota); falta mini-mapa da equipe; KPIs sem as variações ("↑14%"); foi adicionado um card "Diagnóstico de erro" que não está na Home do design.
- **Novo Orçamento:** 4º passo é "Personalizar" (design = **Enviar/sucesso** com WhatsApp + link + Ver PDF).
- **Conta / Login:** só e-mail/senha (design = Face ID/Google/Apple + hub completo).
- Extra do app (não está no design): aba **Diagnóstico (OLLI Técnica)** + **Produtos** como categoria separada — *superset funcional, decidir se mantém.*

---

## 3. Painel web — 🔴 menos fiel

- **Tema invertido:** código **claro** (`--bg #f5f6f8`, `system-ui`, `styles.css` auto-declarado "PLACEHOLDER") vs design **escuro cockpit** (bg `#0A1626`, sidebar `#0A2540`, gradiente de marca, Plus Jakarta + Spectral).
- **Sidebar:** código = Painel/Orçamentos/Clientes/Serviços/Produtos (5); design = Visão geral/Orçamentos/Agenda/Clientes/Equipe/Financeiro (6, com ícones + mascote + perfil).
- **Dashboard:** código = 2 cards; design = 4 KPIs + gráfico 6 meses + tabela "Ordens em andamento" + gauge "Processos 92%" + "Alertas da OLLI".
- **Orçamentos:** falta busca + chips de filtro + coluna Data + ações.
- **Faltam telas:** **Agenda (semana)**, **Equipe (mapa ao vivo)**, **Financeiro**, **CRM de clientes** rico.
- **Cadastro:** design = 3 passos (dados/empresa/plano) + login social; código = form simples.

---

## 4. Link do cliente & PDF

### Link (`/o/<token>` no worker) — 🟡
Funciona (aprovar/recusar grava no Supabase). Faltam: faixa de cabeçalho com gradiente azul→profundo, monograma SVG, **total destacado em Spectral**, mini-cards Pagamento/Garantia/Prazo, badge "PEÇA", data de emissão, e principalmente a **tela de sucesso em tela cheia** com check animado (hoje é só um banner). Tipografia = fonte de sistema (devia ser Plus Jakarta + Spectral). Vários campos faltam porque o **`snapshotPublico`** não os envia (tagline, data, descrições, prazo).

### PDF (`pdfGenerator.ts`) — 🟡
Gera PDF rico, mas: usa **Arial** (devia ser Plus Jakarta + Spectral), cor **azul hardcoded** (devia ser a **cor da marca configurável** — curiosamente o `theme/index.ts` já tem as chaves `pdf*` prontas, mas o gerador não as usa), total em barra escura (design = caixa clara na cor da marca), **2 tabelas** (design = 1 tabela Descrição/Qtd/Unitário/Total com badge "PEÇA"), sem spine de acento, sem marca d'água, sem selo "gerado com OLLI". O atual tem **mais** conteúdo que o design (Área do profissional, Depoimentos, fotos) — decidir o que manter.

---

## 5. Roadmap recomendado (impacto ÷ esforço)

### 🟢 Fase 1 — "Marca fiel" (rápido, alto impacto visual)
1. Adicionar fonte **Spectral** + aplicar em valores/títulos.
2. Corrigir **olhos (redondos) + cabeça (chapada) + visor** do mascote.
3. **Glows coloridos** + anel de foco + corrigir gradiente do splash.
4. **Painel web → tema escuro cockpit** (reescrever tokens do `styles.css` + sidebar com ícones/mascote/perfil).
5. PDF: usar as chaves `pdf*`/cor da marca + Spectral + selo OLLI (paleta já meio-pronta).

### 🟡 Fase 2 — "Telas que faltam, núcleo" (médio)
6. **Agenda** (mobile + painel).
7. Reestruturar navegação para 5 abas + **Conta** como hub.
8. **Hoje/"Meu dia"** + **Notificações**.
9. Link do cliente: identidade + **tela de sucesso animada** (+ ampliar `snapshotPublico`).
10. Passo **Enviar** no wizard (WhatsApp + link + PDF).
11. **CRM/Financeiro** no painel.

### 🔵 Fase 3 — "Diferenciais da OLLI" (grande)
12. **OLLI Voz** (tap-to-talk).
13. **Equipe ao vivo** + Rota do dia + mapa.
14. **Planos & assinatura** + Pagamento (billing).
15. **Chat com a OLLI** + Relatórios.

---

*Fontes: design em `/tmp/design_upload/OLLI/OLLI Handoff/*.dc.html` (prints em `/tmp/designs_png/`); código em `app/olli-orcamentos/`, `web/`, `cloudflare/diagnostico/`.*
