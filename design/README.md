# Handoff: OLLI — Plataforma para Prestadores de Serviço (GR TECH)

## ★ Comece por aqui
**`OLLI App.dc.html` é o protótipo PRINCIPAL** — o app inteiro, navegável e funcional:
abas **Início · Agenda · ＋Orçamento · Hoje · Conta**, com **OLLI Voz** e **Novo Orçamento**
(overlays) e as telas reais abertas pela Conta: **Equipe, Catálogo de serviços, Clientes (CRM),
Códigos de erro, Recibos, Modelos de orçamento**. A **Agenda** tem 3 vistas (**Dia / Semana / Mês**).
Tema escuro, animações de entrada/contagem/brilho. Os arquivos separados (`OLLI Home`, `OLLI Voz`,
`OLLI Telas`, `OLLI Processos`, `OLLI Novo Orçamento`) são telas individuais de referência; o app
consolidado acima é a fonte de verdade da navegação.

## Overview
OLLI é a evolução de um app de orçamentos para uma **plataforma completa de operação** para
prestadores de serviço (foco em ar-condicionado / refrigeração, mas versátil para pintura,
elétrica, etc.). Resolve as dores reais do dia a dia: organização de clientes, agenda com
rotas/trânsito, equipe, estoque, **processos/checklists para não esquecer nada**, orçamentos
(manuais ou por voz), envio por link/PDF, e um painel web de controle para o dono.

**OLLI** também é o nome do **assistente de IA** (um robôzinho amigo, inspirado no Wall-E, nas
cores da marca) presente em todas as telas: resume o dia, alerta, cobra clientes e monta orçamentos.

> Marca de exemplo usada nos mocks: **GR TECH Refrigeração** (CNPJ 44.301.204/0001-38,
> (11) 95875-8030, contato@grtechrefrigeracao.com.br). É placeholder — tudo é personalizável por empresa.

## About the Design Files
Os arquivos `.dc.html` deste pacote são **referências de design feitas em HTML** (protótipos do
visual e do comportamento pretendidos) — **não são código de produção para copiar diretamente.**
A tarefa é **recriar estes designs no app real** (o repo é **Expo SDK 56 + React Native + TypeScript**,
ver stack abaixo), usando os padrões e libs já estabelecidos do projeto. Onde um protótipo é
interativo (OLLI Voz, Novo Orçamento, Link do Cliente), o comportamento mostrado é a referência
da lógica a implementar.

## Fidelity
**Alta fidelidade (hifi).** Cores, tipografia, espaçamento e interações são finais. Recriar a UI
o mais fiel possível usando as libs do app (React Native / Expo). O tema principal do app é
**escuro ("cockpit")**; documentos (PDF) e o link do cliente são **claros**.

## Stack do repositório (alvo da implementação)
- Expo SDK 56 · React Native 0.85 · TypeScript
- React Navigation (bottom tabs + native stack)
- expo-sqlite (offline) + Supabase (backup/sync)
- expo-print / expo-sharing (PDF e compartilhamento)
- react-native-signature-canvas (assinatura)
- react-native-gifted-charts (gráficos)
- @expo-google-fonts/plus-jakarta-sans
- Distribuição pretendida: Android (Play Store), iPhone (PWA), Web (painel do dono)

---

## Design Tokens

### Cores — tema escuro (app)
| Token | Hex / valor | Uso |
|---|---|---|
| bg | `#0A1626` | fundo do app |
| sidebar/tab bg | `#0C1B2E` | barras |
| surface | `rgba(255,255,255,0.05)` | cards |
| surface border | `rgba(255,255,255,0.08)` | borda de card |
| primary | `#0B6FCE` | azul OLLI |
| accent / frost | `#34C6D9` → `#7FE9F5` | ciano (ações, destaques, IA) |
| ink (deep) | `#0A2540` | azul profundo |
| success | `#2BD787` / `#15B66E` | aprovado, ok |
| warning | `#F7B23B` | alertas |
| danger | `#FF6B6B` / `#F25555` | erro, atrasado |
| text | `#FFFFFF` | texto primário |
| text muted | `rgba(226,232,240,0.55)` | secundário |

### Cores — tema claro (PDF / documento / link cliente)
| Token | Hex |
|---|---|
| paper | `#FFFFFF` |
| canvas | `#E4E7EC` / radial `#EDEFF3→#DFE3E9` |
| ink | `#16202E` / `#1A2230` |
| muted | `#5A6575` / `#8A93A2` |
| hairline | `#E7E9EE` / `#EDEFF2` |
| accent (personalizável) | `#0B6FCE` (padrão) · opções: `#0E7C66`, `#B4451F`, `#5B3DA8`, `#1C2230` |
| accent soft | `color-mix(in srgb, <accent> 8%, #fff)` |

### Tipografia
- **Plus Jakarta Sans** (400/500/600/700/800) — toda a UI.
- **Spectral** (serif, 500/600/700) — títulos de documento e números de destaque (PDF, "Orçamento", totais). Dá o tom editorial/único.
- Escala: títulos de tela 22–30px/800; seção 16px/800; corpo 13–14px; rótulos small-caps 10–11px/800 com `letter-spacing: 1–1.5px`.

### Raio / sombra / espaçamento
- Raios: chips 999px; cards 14–22px; botões 12–14px; tab/FAB 25px.
- Sombra de card (claro): `0 20px 50px rgba(15,23,42,0.12)`; (escuro) `0 14px 34px rgba(0,0,0,0.35)`.
- Espaçamento base 4/8/12/16/18/24px. Padding lateral de tela: 16–18px.
- Toque mínimo: 44px.

### Mascote OLLI (logo do assistente de IA)
SVG geométrico simples (nada complexo): cabeça = retângulo arredondado (rx 11) com olhos
ciano `#7FE9F5` e uma antena (linha + ponto). Anima: olhos piscam (`scaleY` ocasional) e
flutua levemente. No app aparece em gradiente `#0B6FCE→#34C6D9`. Há também o **monograma "O"**
(anel em gradiente com um ponto de gelo) usado como marca d'água no PDF.

---

## Telas / Views

### 1. Home — "Cockpit" (escuro) · `OLLI Home.dc.html`
Tela inicial. De cima pra baixo:
- **Top bar:** saudação + nome + botão OLLI (abre o assistente; badge de notificações).
- **AO VIVO · Próxima parada** (card herói): cliente, serviço, endereço, **anel de countdown ao vivo** ("falta XX:XX p/ sair"), alerta de trânsito ("saia às 14:02"), botões Iniciar rota + Ligar.
- **KPIs compactos:** Faturamento (R$ + % vs mês anterior), Conversão, Em aberto (com nº parados). *(Sem ticket médio, sem "nº técnicos", sem estoque — removidos a pedido.)*
- **Lembrete da OLLI:** orçamentos parados +5 dias → botão Cobrar.
- **Antes de sair (mala de hoje):** checklist do que levar pros serviços, com progresso (ex. 4/6) e chips dos itens pendentes.
- **Equipe ao vivo:** mini-mapa (placeholder) com pins dos técnicos + legenda (em rota / atendendo / livre) + "Abrir mapa".
- **Resto do dia:** timeline dos próximos trabalhos.
- **Ações rápidas:** Novo orçamento, Emitir recibo, Agendar visita, Código de erro.
- **Tab bar (5):** Início · Agenda · **[Orçamento]** (botão central elevado, gradiente) · Estoque · Conta.

### 2. OLLI Voz — orçamento por voz (interativo) · `OLLI Voz.dc.html`
Máquina de estados: **idle → listening → processing → result**.
- **idle:** robô grande + "Toque e me conte o serviço" + botão de microfone (gradiente, 76px).
- **listening:** robô com anéis pulsando + waveform animada + **transcrição ao vivo** (texto aparecendo char a char). Botão vira "parar".
- **processing:** spinner + checklist ("Entendi o serviço / Busquei preços / Montando…").
- **result:** orçamento montado — cliente, itens com ícones (cada um editável), badge "OLLI sugeriu", "Adicionar item", subtotal/deslocamento/**Total**, botões Refazer / Revisar e enviar.
- Implementação real: usar speech-to-text + LLM para extrair itens do que foi falado e casar com o catálogo de preços do usuário.

### 3. Agenda inteligente (escuro) · em `OLLI Telas.dc.html`
- Header + **strip de dias** da semana (hoje destacado).
- Resumo: nº trabalhos · R$ previsto · nº alertas de rota.
- **Timeline vertical** dos trabalhos do dia; entre paradas, **chips de deslocamento** ("20 min · trânsito ok"). O próximo trabalho mostra o **alerta "saia 14:02 · trânsito intenso"** + Rota.

### 4. Equipe (escuro) · em `OLLI Telas.dc.html`
- Resumo: em rota / atendendo / livre.
- Cards de técnico: avatar + status (dot colorido), função, trabalho atual/local, serviços do dia, nota, botão ligar/rota; card de "livre" com "Atribuir próximo trabalho".

### 5. Estoque + preços via API (escuro) · em `OLLI Telas.dc.html`
- Resumo: itens / valor em estoque / em falta.
- **Alerta de preço da OLLI (via API):** "Gás R-410A subiu 8%… repor agora trava o preço".
- Lista de insumos: qtd, status (baixo), **preço de mercado** + seta de tendência (↑/↓/→). *(Obs.: o dono disse que preço não é prioridade — manter, mas não central.)*

### 6. Códigos de erro (escuro) · em `OLLI Telas.dc.html`
- Busca por código/modelo + chips de marca (LG, Samsung, Midea, Daikin, Gree…).
- **Card de resultado** (ex. "E5 · Erro de comunicação" — LG): causas prováveis, **solução passo a passo numerada**, peças relacionadas, botão "Perguntar à OLLI".
- **Dados:** o dono vai popular a base via varredura de manuais (IA baixa/extrai) no Claude Code. Construir só a UI + um schema `codigo_erro { marca, modelo, codigo, titulo, causas[], passos[], pecas[] }`.

### 7. Orçamentos — lista (escuro) · em `OLLI Telas.dc.html`
- Resumo (no mês / aprovados / conversão) + filtros (Todos/Enviados/Aprovados/Recusados).
- Cards: avatar, nome, nº, data, **badge de status** (Rascunho·OLLI / Parado +5 dias / Aprovado), valor; itens parados têm botão **Cobrar**.
- **FAB "Criar por voz"** (atalho pra OLLI Voz).

### 8. Processos & Lembretes (escuro) · `OLLI Processos.dc.html`
Duas telas — o "cérebro externo" (não esquecer / seguir processo):
- **Meu dia:** "Antes de sair" (mala, com progresso + checklist), **Lembretes** (seguro da van vence, confirmar visita, pós-venda 7 dias), **Processos prontos** (templates: instalação 12 passos, manutenção 8 passos…).
- **Ordem de Serviço guiada:** barra de progresso + **etapas em checklist** (Chegada → Diagnóstico → Execução [subitens] → Teste → Fotos antes/depois → Assinatura). A **OLLI bloqueia o fechamento** sem foto do "depois" + assinatura. Botão Concluir desabilitado até completar.

### 9. Novo Orçamento — wizard 4 etapas (interativo, escuro) · `OLLI Novo Orçamento.dc.html`
Réplica melhorada do fluxo do app antigo. Tabs: **Cliente · Itens · Detalhes · Enviar** (acendem conforme avança).
- **Cliente:** cliente selecionado (card) + Trocar / Novo cliente + atalho pra voz.
- **Itens:** busca + lista de serviços com **checkbox toggle**; total recalcula ao vivo na barra inferior.
- **Detalhes:** pagamento, garantia, validade, laudo técnico, **aprovação online** (toggle).
- **Enviar (sucesso):** "Orçamento criado!" + **link copiável** (`grtech.olli.app/o/…`) + Enviar no WhatsApp + **Abrir link** + **Ver PDF** (ambos abrem as telas reais) + Salvar como modelo.
- Barra inferior persistente: **Valor total** + botão Próximo / "Revisar e enviar".

### 10. Orçamento em PDF — A4, personalizável · `OLLI Orçamento.dc.html` (raiz do projeto)
Documento **editorial e elegante**, 794×1123 (A4). Cada empresa personaliza:
- **Logo arrastável** (componente de slot de imagem que persiste).
- **Dados da empresa + nº + cor da marca** via **props/Tweaks** (`empresa`, `tagline`, `cnpj`, `telefone`, `email`, `endereco`, `numero`, `accent`).
- Layout: espinha de cor à esquerda, marca d'água do monograma, "Orçamento" em Spectral, blocos Prestador/Cliente, **tabela de itens** (small-caps, hairlines, números tabulares), totais com **Total** em destaque (accent), condições (pagamento/garantia/prazo), assinaturas, rodapé.
- No app real: gerar com `expo-print` (HTML→PDF). A cor/dados vêm do cadastro da empresa.

### 11. Link do Cliente — web (claro) · `OLLI/OLLI Link Cliente.dc.html`
Página web responsiva que o cliente abre sem instalar (mostrada em moldura de navegador).
Estados: **pendente → aprovado**.
- Header com gradiente + logo/nome da empresa.
- Card: saudação, nº, validade, itens, **Total** (Spectral), pagamento/garantia/prazo.
- Ações: **Aprovar** (verde) / Recusar / Tirar dúvida (WhatsApp).
- **Sucesso:** check animado "Orçamento aprovado!" + total + "ver novamente". (Aprovar/recusar gravam status no backend e notificam a empresa.)

### 12. Painel Web do Patrão (escuro) · `OLLI/OLLI Web.dc.html`
Desktop/PWA, em moldura de navegador.
- **Login:** painel de marca + form com alternância **Administrador / Funcionário** (admin vê tudo de todos; funcionário só o dele).
- **Dashboard:** sidebar (Visão geral, Equipe, Agenda, Orçamentos, Estoque, Processos, Financeiro) + usuário (Marcos · Administrador). Conteúdo: **KPIs** (faturamento, OS hoje, conversão, equipe em campo), **gráfico** de faturamento 6 meses, **tabela "Ordens em andamento · cumprimento de processo"** (técnico, etapa, checklist %, status), **donut "Processos cumpridos 92%"**, **Equipe ao vivo**, **Alertas da OLLI**.

---

## Interactions & Behavior
- **Countdown ao vivo** (Home / OLLI Voz / Agenda): `setInterval` 1s decrementando; formato `m:ss`; estado de urgência (<30min) ativa pulso vermelho.
- **OLLI Voz:** typing da transcrição (~32ms/2 chars) → auto-avança → processing (~1.8s) → result. Botão mic alterna start/stop.
- **Novo Orçamento:** toggle de itens recalcula total; tabs acendem por etapa; passo 3 → botão "Revisar e enviar" leva ao sucesso; "copiar" mostra "Copiado!".
- **Link do Cliente:** Aprovar → estado de sucesso com check animado (`pop` 0.5s).
- **OS guiada:** marcar itens avança progresso; concluir só habilita com fotos + assinatura.
- Animações-chave: `olliBlink` (olhos), `olliFloat` (robô), `olliPulse` (dots), `olliRing` (anéis de escuta), `pop`/`olliPop` (sucesso). Durations 0.5–1.8s, easing ease/ease-out.

## State Management
- `orcamento`: { cliente, itens[{servicoId, qtd, valorUnit}], subtotal, desconto, deslocamento, total, status, condicoes, validade, numero }
- `os` (ordem de serviço): { orcamentoId, etapas[{ nome, itens[{label, done}] }], fotos[], assinatura, progresso, status }
- `voz`: { step: idle|listening|processing|result, transcript, itensExtraidos[] }
- `usuario`: { papel: admin|funcionario, empresaId }
- `empresa` (personalização PDF/link): { nome, tagline, cnpj, telefone, email, endereco, logoUri, accent }
- Catálogo: `cliente`, `servico`, `produto`, `estoqueItem`, `lembrete`, `codigoErro`, `tecnico`.
- Dados live (equipe/rotas/trânsito): integrar API de mapas/rotas (ex. Google Directions) p/ ETA e "saia agora".

## Assets
- Nenhum bitmap obrigatório. Mascote OLLI e monograma são **SVG inline** (especificados acima).
- Ícones: usar a lib de ícones do app (ex. @expo/vector-icons / MaterialCommunityIcons) — nos mocks são SVGs stroke simples (home, calendar, box, user, wrench, map-pin, phone, mic, check…).
- Fontes: Plus Jakarta Sans + Spectral (Google Fonts).
- Logo da empresa: fornecida pelo usuário (slot de imagem no PDF).

## Files (referências de design neste pacote)
- `OLLI Home.dc.html` — Home (cockpit) com processos integrados
- `OLLI Voz.dc.html` — assistente de voz (interativo)
- `OLLI Telas.dc.html` — Agenda, Equipe, Estoque, Códigos de erro, Orçamentos (grid)
- `OLLI Processos.dc.html` — Meu dia + OS guiada
- `OLLI Novo Orçamento.dc.html` — wizard 4 etapas (interativo)
- `OLLI Orçamento.dc.html` — PDF A4 personalizável (props/Tweaks)
- `OLLI Link Cliente.dc.html` — página web do cliente (aprovar/recusar)
- `OLLI Web.dc.html` — login + painel web do patrão
- `OLLI Dashboard.dc.html` — exploração inicial (3 variações da Home) — referência histórica
- Componentes de moldura/scaffold: `ios-frame.jsx`, `browser-window.jsx`, `image-slot.js`
- `support.js` — runtime dos arquivos `.dc.html` (só pra abrir os mocks no navegador)

> Para abrir os mocks: abra os `.dc.html` num navegador. Eles são **referência visual/comportamental**; a implementação final deve ser feita em React Native/Expo no repositório, reaproveitando os componentes e o tema já existentes (cores, fontes, navegação).

## Apêndice — Modelo de planos (discutido, opcional)
O concorrente cobra ~R$50/mês e só faz orçamento. OLLI faz a operação inteira → preço por valor:
- **Grátis** (isca): 5 orçamentos/mês, 1 usuário.
- **Pro** R$49–69/mês: orçamentos ilimitados, OLLI Voz, PDF/link com logo, agenda, catálogo.
- **Empresa** R$149–229/mês: + funcionários, painel web, processos/checklists, estoque, equipe ao vivo.
- **+ Funcionário** R$29–39/mês por técnico extra. Teste grátis 14 dias; anual com ~2 meses grátis.
