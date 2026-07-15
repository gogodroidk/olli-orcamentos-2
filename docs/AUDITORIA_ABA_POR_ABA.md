# OLLI Painel — Auditoria aba por aba (força total, Fable)

> Auditoria de **18 especialistas Fable** (13 por aba + 5 transversais), sintetizada pelo Opus.
> Lida caractere por caractere, com arquivo:linha e correção concreta em cada achado.
> **Data:** 2026-07-14 · **Escopo:** painel web (`webapp/`) + landing (`web/`).

**Placar:** 🔴 2 P0 · 🟠 32 P1 · 🟡 62 P2 · ⚪ 56 P3 = **152 achados**

---

## Resumo executivo

O painel web do OLLI está numa faixa real de 7 a 8 de 10: a fundação de dados é genuinamente boa e rara (blob relido/merged, totais idênticos ao app centavo a centavo, "não sei ≠ R$ 0,00" levado a sério, soft delete honesto, 3 estados de verdade), e as telas OLLI novas têm a11y deliberada (caminho de teclado paralelo a todo arraste). Mas o painel ainda não passa no próprio gate da casa por causa de poucas RAÍZES que se repetem em quase toda aba. Duas são P0 de perda/corrupção de dado com uso NORMAL: catálogo apaga o modelo de produto sem marca ao editar, e "2.5" digitado no teclado numérico vira 25 (dinheiro e quantidade multiplicados por 10, em silêncio, indo pro PDF do cliente). Acima disso: o cap silencioso de 1000 linhas do PostgREST (select("*") sem limite) corrompe KPIs e pode DUPLICAR número de documento; a numeração é por-usuário e não-atômica (dono e membro emitem o mesmo número); recibos/catálogo não têm gate de papel e a escrita do membro nasce num tenant que a empresa nunca vê; o contraste do tema CLARO nunca foi auditado (o escuro foi) e reprova AA em botões, avisos e no "Sair" que aparecem em toda tela; e um Campo compartilhado sem htmlFor deixa ~95 campos de formulário sem nome acessível. A casca herdada do template (login, header, config) é a parte mais fraca: fluxos de auth mortos vendidos como reais, motion decorativo, botões sem aria-label e — o pior isolado — uma senha de conta demo de produção commitada em repositório PÚBLICO. Nada disso é retrabalho de fundação; é uma onda de correção concentrada em ~8 arquivos-raiz que destrava a maioria dos achados de uma vez.

---

## As 8 raízes (corrigir a raiz mata dezenas de sintomas)

Oito raízes explicam a maioria dos achados; corrigir a raiz mata dezenas de sintomas. (1) CONTRASTE DO TEMA CLARO nunca auditado: os tokens semânticos default (warning #FFAB00=1,9:1, success #36B37E=2,7:1, error #FF5630=3,2:1, info) são usados como TEXTO pequeno em ~15 pontos; --muted-foreground=gray-500 (2,7:1) contamina placeholders/descrições; --primary-foreground reprova no escuro (2,4:1) e --destructive-foreground nem existe. O Badge já faz certo (tom -dark/-light) — o padrão só não foi propagado. Raiz: global.css + campos.tsx:40. (2) CAMPO SEM htmlFor: um único componente (webapp/src/olli/components/campos.tsx:34) sem useId/htmlFor derruba a11y de ~95 campos em 9 formulários — a correção é 1 arquivo. (3) select("*") SEM LIMIT (webapp/src/olli/data.ts:19): o cap silencioso de 1000 do PostgREST é a versão em escala do bug crônico da casa ("dado que existe vira invisível sem erro") — corrompe os KPIs, faz a agenda de hoje virar vazio falso, pode DUPLICAR número de OS, e ainda baixa o blob jsonb inteiro 3x em caches paralelos. (4) NUMERAÇÃO por-usuário e não-atômica (mutacoes.ts): contador com RLS owner-only + read-modify-write sem transação → dono e membro (ou duas abas) emitem o MESMO número de documento fiscal-adjacente ao cliente; precisa de RPC atômica por tenant. (5) GATE DE PAPEL AUSENTE em recibos e catálogo: escrita de membro não-dono nasce no tenant DELE e some para a empresa (mesma família de "não sei vira não tem" que Meu Negócio já resolveu). (6) CHROME DO TEMPLATE SLASH não passou pelo rigor das telas OLLI: motion decorativo (engrenagem girando infinito, sem prefers-reduced-motion), botões-ícone sem aria-label, fluxos de auth mortos (criar conta/redefinir senha/OAuth), e código morto no bundle (antd ~95KB, mobile/qr forms, multi-tabs). (7) "ERRO/DESCONHECIDO VIRA VAZIO/SUCESSO": retry faltando no donut/recentes, OAuth e reset silenciosos, valor desconhecido virando R$ 0,00 na linha degradada. (8) RELEITURA FRESCA ANTES DE GRAVAR aplicada só no Kanban/OS e esquecida em FormOrcamento/FormEquipamento/useExcluir → lost update que apaga fotos/assinatura do celular.

---

## Nota por aba

| Aba | Nota | Resumo |
|---|---|---|
| **Início (dashboard)** | 7,5/10 | Contas financeiras sólidas e honestas (data do blob, piso por orçamento, semValor/semData), mas mente em escala: o cap de 1000 linhas corrompe os 4 KPIs, o donut e a agenda de hoje; e o aviso âmbar anti-mentira é quase ilegível no claro (1,9:1). |
| **Quadro (Kanban)** | 8/10 | Melhor caminho de gravação do painel (blob relido fresco, rollback por card, 10 status sem buraco, dinheiro honesto). Falta contraste do alerta mais importante do card, a11y pt-BR do drag e leveza de escala. |
| **Orçamentos (lista + editor)** | 7,5/10 | Fundação exemplar (totais idênticos ao app, número só no submit, trava de enviado no lugar), mas dois campos numéricos corrompem dinheiro com digitação legítima, a numeração duplica na equipe, a trava defensiva é código morto e a a11y do form reprova. |
| **Clientes (CRUD + ViaCEP)** | 7,5/10 | Missão crítica correta e em paridade byte a byte com o app (remascarar no submit, ViaCEP com 3 estados, CPF/CNPJ opcional). Sobram a11y de labels e dois comportamentos do CEP que mexem em dado sem o usuário pedir. |
| **Catálogo (produtos/serviços + margem)** | 7,5/10 | Área madura (margem idêntica ao app, soft delete honesto), mas com o único P0 confirmado do painel: editar um produto sem marca APAGA o modelo em silêncio. Mais falhas de a11y e contraste de margem. |
| **Recibos (recibo + parcial)** | 8/10 | Sólida: lê a data do BLOB (nunca da coluna corrompida), merge na edição, parcial com 3 estados honestos, REC- em paridade. O furo é a ausência de gate de papel — recibo de membro nasce no tenant errado e some para o dono. |
| **Ordens de Serviço (OS + checklist)** | 8/10 | A aba mais bem defendida (releitura fresca, 3 estados, contrato exato). Os riscos que sobram são de escala (cap de 1000 que pode duplicar número de OS) e o merge do checklist que reverte o trabalho do técnico. |
| **Agenda (FullCalendar)** | 7,5/10 | Arquitetura exemplar (arrasto otimista com rollback correto, tema escuro do FC resolvido por variáveis). Mas o form principal não tem nome acessível em nenhum campo, o roteiro do dia exibe término estimado como real, e o ⋮ (reagendar no toque) tem 20px. |
| **Equipamentos (assets)** | 8/10 | Contrato impecável (qr_token nunca inventado, enums batem com o banco, 4 estados na coluna Cliente). Perde em a11y de form e no mapa de cores que MENTE: 'Desativado' aparece verde. |
| **Meu Negócio + Planos** | 7,5/10 | Fundação de dados exemplar (merge campo-a-campo com releitura + guarda de conflito, cópias literais conferidas contra o app). Mas a a11y de labels, a validação silenciosa de CNPJ e o white-label que não persiste fora da tela derrubam a experiência. |
| **Login (auth)** | 5,5/10 | O miolo é real e bem pensado (Supabase PKCE + useAuthSync + prefill demo restrito a DEV), mas em volta há fluxo morto de template vendido como real, botões que submetem o form por engano, OAuth silencioso e os dois achados de a11y 'já sabidos' sem correção. |
| **Casca do dashboard (nav, header, conta, tema)** | 7/10 | Sólida no desktop (15 rotas do menu sem 404, white-label pensado, logout feliz limpa tudo), mas o celular (drawer que não fecha) e o teclado/leitor de tela (stops mortos, botões sem nome, contraste do 'Sair') não passam no gate. |
| **Landing Astro** | 8/10 | Landing sólida e honesta (CSP por hash verificada, reduced-motion de verdade, mobile sem vazamento, copy de ajuda/legal importada da fonte). Resta reconciliar copy de planos com a fonte e polir a11y/UX de esforço baixo. |
| **Contrato de dados (transversal)** | 8/10 | A fundação de escrita (contrato.ts/mutacoes.ts/datas.ts) é espelho fiel e disciplinado do app, com merge de blob e 3 estados levados a sério. Os problemas reais são semânticas multi-tenant herdadas e a releitura fresca que ficou de fora em dois formulários. |
| **Design system (transversal)** | 6,5/10 | Fundação boa (tokens vanilla-extract→Tailwind de uma fonte só, componentes compartilhados, FC tematizado direito), mas 3 furos de token quebram AA em botões de TODA tela, o Início criou uma paleta paralela (mesmo status, 3 cores) e o 'Tentar de novo' tem 5 visuais. |
| **Acessibilidade (transversal)** | 7/10 | As telas OLLI novas têm a11y deliberada e acima da média (teclado paralelo a todo arraste, aria-label nos ícones, foco tratado). O que derruba são os TOKENS DE COR no claro e o chrome herdado (config 100% mouse, botões-ícone sem nome, labels não associados). |
| **Segurança (transversal)** | 6,5/10 | Fundação anti-XSS/CSP exemplar e rara nesse porte, mas uma credencial de produção está pública no GitHub e o painel deixa membro gravar recibo/catálogo num tenant que a empresa nunca vê — gravação silenciosa em tenant errado é justamente o bug que a casa jurou não repetir. |
| **Performance (transversal)** | 7/10 | Runtime disciplinado (rotas lazy, memoização certa, otimista com rollback), mas o bundle inicial carrega ~100KB gzip de antd que nenhuma tela usa, o apexcharts bloqueia a rota padrão por um donut, e a camada de dados baixa tabelas inteiras (com blob) até 3x. |

---

## Achados por aba

### Início (dashboard) — 7,5/10

Contas financeiras sólidas e honestas (data do blob, piso por orçamento, semValor/semData), mas mente em escala: o cap de 1000 linhas corrompe os 4 KPIs, o donut e a agenda de hoje; e o aviso âmbar anti-mentira é quase ilegível no claro (1,9:1).

- Cap de 1000 do PostgREST corrompe KPIs/donut/Parados e faz a agenda de hoje virar vazio falso (data.ts:19, FaixaHoje.tsx:20) — P1
- Aviso âmbar #FFAB00 a 1,9:1 no claro, o próprio mecanismo NÃO-SEI≠ZERO ilegível (KpiDinheiroCard:96, ParadosCard:125) — P1
- Donut e Orçamentos recentes sem 'Tentar de novo' — violam a regra dos 3 estados (StatusDonutCard:80, RecentOrcamentosCard:51) — P2
- semValor do 'Recebido no mês' calculado e nunca exibido: recibo some da conta em silêncio (index.tsx:116) — P2
- P3: pill 'Visualizado' 1,7:1; brParaYmd aceita 31/31; fallback usa subtotal pré-desconto; copy 'tudo aprovado já pago' em conta sem aprovados

### Quadro (Kanban) — 8/10

Melhor caminho de gravação do painel (blob relido fresco, rollback por card, 10 status sem buraco, dinheiro honesto). Falta contraste do alerta mais importante do card, a11y pt-BR do drag e leveza de escala.

- Alerta 'esfriando' em #FFAB00 sobre card branco ~1,9:1 — a informação-alerta é a menos legível (task-card.tsx:69) — P1
- Anúncios/instruções do drag saem em INGLÊS no leitor de tela num produto 100% pt-BR (kanban-board.tsx:152) — P2
- Alça e menu em gray-500 2,7:1: os dois únicos controles do card somem para baixa visão (task-card.tsx:112) — P2
- Busca TODOS os orçamentos com blob inteiro, sem limite/virtualização; soma da coluna vira histórico, não pipeline (useQuadro.ts:49) — P2
- P3: card aterrissa no meio e 'pula' no refetch; mover excluído dá toast de sucesso; vazio sem CTA; card não abre o orçamento

### Orçamentos (lista + editor) — 7,5/10

Fundação exemplar (totais idênticos ao app, número só no submit, trava de enviado no lugar), mas dois campos numéricos corrompem dinheiro com digitação legítima, a numeração duplica na equipe, a trava defensiva é código morto e a a11y do form reprova.

- '2.5' (ponto decimal do teclado) vira 25: quantidade e desconto % ×10, em silêncio, indo pro PDF (FormOrcamento.tsx:201) — P0
- Desconto % aceita negativo e o total fica MAIOR que o subtotal sem linha de desconto visível (FormOrcamento.tsx:408) — P1
- Trava de 'já enviado' checa prop capturada ao abrir = sempre falsa: salva por cima do documento que o cliente tem (FormOrcamento.tsx:424) — P1
- Numeração não compartilhada na equipe: membro emite número DUPLICADO (mutacoes.ts:101) — P1
- P2/P3: sem releitura fresca (lost update apaga fotos); retry queima número; blob legado sem formasPagamento derruba a tela; 'convertido' edita por cima do recibo; copy 'Rascunho' mente em recusado/expirado

### Clientes (CRUD + ViaCEP) — 7,5/10

Missão crítica correta e em paridade byte a byte com o app (remascarar no submit, ViaCEP com 3 estados, CPF/CNPJ opcional). Sobram a11y de labels e dois comportamentos do CEP que mexem em dado sem o usuário pedir.

- Abrir cliente para editar dispara ViaCEP no mount e sobrescreve cidade/UF corrigidas à mão (FormCliente.tsx:164) — P2
- Corrida do CEP: resposta obsoleta preenche endereço depois de apagar o CEP (FormCliente.tsx:167) — P2
- Telefone legado >11 dígitos truncado em silêncio ao salvar (+55 vira DDD 55) (FormCliente.tsx:113) — P2
- Aviso de duplicidade sem live region: leitor de tela nunca ouve e cadastra o duplicado (FormCliente.tsx:324) — P2
- P3: CEP incompleto salvo sem aviso; duplicidade ignora CNPJ; Esc descarta o form sujo; busca não acha telefone sem máscara

### Catálogo (produtos/serviços + margem) — 7,5/10

Área madura (margem idêntica ao app, soft delete honesto), mas com o único P0 confirmado do painel: editar um produto sem marca APAGA o modelo em silêncio. Mais falhas de a11y e contraste de margem.

- ehProduto por formato (marca in item) apaga o modelo de produto sem marca ao editar, e o esconde da lista e da busca (FormItemCatalogo.tsx:65) — P0
- Salvar com busca ativa faz o item sumir sem feedback: parece que falhou, dono recadastra (aoSalvar morta, ListaCatalogo:418) — P2
- Técnico descobre que não pode mexer no catálogo só DEPOIS de preencher tudo (sem gate de papel, ListaCatalogo:210) — P2
- Margem success 2,7:1 e prejuízo error 3,2:1 reprovam no claro (ListaCatalogo:92) — P1 (raiz de tokens)
- P3: margem 0% aparece VERDE com seta pra cima; busca de duas palavras falha com palavra no meio

### Recibos (recibo + parcial) — 8/10

Sólida: lê a data do BLOB (nunca da coluna corrompida), merge na edição, parcial com 3 estados honestos, REC- em paridade. O furo é a ausência de gate de papel — recibo de membro nasce no tenant errado e some para o dono.

- Membro não-dono emite recibo que nasce no tenant DELE, invisível para o dono; a conta de 'já recebido' passa a mentir (FormRecibo.tsx:76) — P1
- Número REC- pode duplicar: incremento não-atômico (mutacoes.ts:114) — P2
- Visitar /recibos baixa TODOS os orçamentos (blob inteiro) mesmo sem abrir o form (FormRecibo.tsx:91) — P2
- Linha degradada imprime 'R$ 0,00' onde o valor é desconhecido — o bug crônico da casa (index.tsx:270) — P2
- P3: retry queima REC-; copy 'Este novo recibo de R$ 0,00' na edição; data sem min/max; grid-cols-3 estoura no celular

### Ordens de Serviço (OS + checklist) — 8/10

A aba mais bem defendida (releitura fresca, 3 estados, contrato exato). Os riscos que sobram são de escala (cap de 1000 que pode duplicar número de OS) e o merge do checklist que reverte o trabalho do técnico.

- proximoNumeroOs pode DUPLICAR número acima de 1000 linhas (cap do PostgREST, mutacoes.ts:133) — P1
- Checklist marcado pelo técnico no celular é revertido ao salvar, e a copy promete o contrário (FormOs.tsx:200) — P2
- useContextoDeEscrita usa maybeSingle: membro de 2 orgs tem TODA gravação bloqueada (mutacoes.ts:61) — P2
- Lista sem paginação: acima de 1000 OS as antigas somem da tela E da busca sem aviso (data.ts:19) — P2
- P3: status desconhecido regravado como 'aberta'; sem cadastrar/desvincular cliente no form; card mobile omite fotos; comentário 'incluirExcluidos' enganoso

### Agenda (FullCalendar) — 7,5/10

Arquitetura exemplar (arrasto otimista com rollback correto, tema escuro do FC resolvido por variáveis). Mas o form principal não tem nome acessível em nenhum campo, o roteiro do dia exibe término estimado como real, e o ⋮ (reagendar no toque) tem 20px.

- Roteiro do dia (visão padrão do celular) mostra o término ESTIMADO como horário real na coluna de hora (index.tsx:188) — P1
- Botão ⋮ tem 20px e vive a 45% no toque; errar por 2mm abre a edição que ninguém pediu (agenda.css:139) — P1
- Nenhum campo do FormAgendamento tem nome acessível — dois datetime-local idênticos sem distinção (FormAgendamento.tsx:290) — P1
- P2: esticar evento 'sem hora' grava término 00:00; erro de 'concluir' fica atrás do modal; listWeek trava no desktop; cancelado a 55% reprova contraste
- P3: reagendar fecha ao falhar; 'capitalize' vira '14 De Julho'; 'sem hora' depende do fuso do navegador

### Equipamentos (assets) — 8/10

Contrato impecável (qr_token nunca inventado, enums batem com o banco, 4 estados na coluna Cliente). Perde em a11y de form e no mapa de cores que MENTE: 'Desativado' aparece verde.

- 'Desativado' ganha badge VERDE porque a regex casa 'ativa' dentro de 'Desativado'; 'Interditado' cai no cinza neutro (record-list-helpers.tsx:44) — P1
- Filtro de situação fica PRESO sem UI para limpá-lo → lista vazia sem saída (index.tsx:224) — P2
- Impossível DESVINCULAR o cliente (o app desktop permite) — quebra de paridade (FormEquipamento.tsx:199) — P2
- Contador do chip ativo 3,5:1 e chip inativo usa token de 'desabilitado' para dado informativo (index.tsx:456) — P2
- P3: salvar sem try/catch (unhandled rejection); categoria fora do catálogo invisível no Select; card mobile sem fallback de nº de série

### Meu Negócio + Planos — 7,5/10

Fundação de dados exemplar (merge campo-a-campo com releitura + guarda de conflito, cópias literais conferidas contra o app). Mas a a11y de labels, a validação silenciosa de CNPJ e o white-label que não persiste fora da tela derrubam a experiência.

- Cor da marca salva nunca pinta o painel fora de Meu Negócio: pickBrandColor não olha o blob dados.corMarca (branding.ts:45) — P1
- CNPJ/CPF inválido: clicar Salvar não dá NENHUM feedback (erro fora da viewport, focus no-op) (index.tsx:249) — P1
- P2: barra diz 'Alterações salvas' com edição pendente; refetch de fundo troca o form pelo card de erro; white-label sem guarda de contraste (Ciano 1,66:1); membro vê 'plano Grátis' em empresa pagante
- P2: navegar pelo menu (SPA) descarta o rascunho sem aviso (só cobre beforeunload)
- P3: 'sujo' falso-positivo por ordem de chaves do jsonb; cancelamento com período vigente diz 'terminou em' + data futura

### Login (auth) — 5,5/10

O miolo é real e bem pensado (Supabase PKCE + useAuthSync + prefill demo restrito a DEV), mas em volta há fluxo morto de template vendido como real, botões que submetem o form por engano, OAuth silencioso e os dois achados de a11y 'já sabidos' sem correção.

- 'Esqueceu a senha?' e 'Cadastre-se' sem type=button submetem o form de login (login-form.tsx:115/146) — P1
- 'Criar conta' posta em endpoint mock inexistente e 'Redefinir senha' só faz console.log — fluxos mortos (register-form.tsx:16, reset-form.tsx:15) — P1
- Erro de login aparece em INGLÊS cru do Supabase; OAuth Google/Apple falha em silêncio total (userStore.ts:81, login-form.tsx:34) — P1
- P2: senha logada no console; 'Lembrar de mim' decorativo; botão Entrar aceita duplo clique; links de Termos apontam para './' e recarregam
- P3: mobile/qr forms mortos no bundle (QR aponta pro template no GitHub); locale 'Chinese' num produto pt-BR

### Casca do dashboard (nav, header, conta, tema) — 7/10

Sólida no desktop (15 rotas do menu sem 404, white-label pensado, logout feliz limpa tudo), mas o celular (drawer que não fecha) e o teclado/leitor de tela (stops mortos, botões sem nome, contraste do 'Sair') não passam no gate.

- Cache do React Query só é limpo no logout do dropdown: troca de conta na mesma aba vaza dados do tenant anterior (userStore.ts:133) — P1
- Drawer do menu no celular não fecha ao tocar num item e o X foi escondido (nav-mobile-layout.tsx:18) — P1
- Cada item do menu é <a> dentro de <button>: ~30 stops de teclado, metade inúteis, HTML inválido (nav-list.tsx:25) — P1
- 'Sair' em #FFAB00 sobre branco = 1,6:1; nenhum controle do header tem aria-label (account-dropdown:72, header:32) — P1
- P2/P3: nome 'OLLI' some ao colapsar (maxWidth:'auto' inválido); ⌘K num público Windows; busca usa replace() e quebra o Voltar; HighlightText monta RegExp com texto cru; multi-tabs morto no repo

### Landing Astro — 8/10

Landing sólida e honesta (CSP por hash verificada, reduced-motion de verdade, mobile sem vazamento, copy de ajuda/legal importada da fonte). Resta reconciliar copy de planos com a fonte e polir a11y/UX de esforço baixo.

- Plano Empresa vende como pronto o que a fonte marca '(em breve)': equipe/mapa/painel — o próprio arquivo já registrou esse erro antes (index.astro:42) — P1
- P2: celular 3D cortado reto em tablet (640-1023px); mockup inteiro lido como conteúdo real (sem aria-hidden); home sem <main>; FAQ com alvo clicável de 24px
- P2: '12x para planos pagos' mas só o Pro parcela; CTA 'Falar com a gente' abre o login; 'Entrar' some no celular
- P3: FAQ afirma exportação self-service que não existe; fonte Spectral morta no dist; _headers sem HSTS; '© 2026' fixo
- Pontos fortes reais: CSP script-src por hash sem unsafe-inline, SEO correto, fontes self-hosted, mockup em código (não print de template)

### Contrato de dados (transversal) — 8/10

A fundação de escrita (contrato.ts/mutacoes.ts/datas.ts) é espelho fiel e disciplinado do app, com merge de blob e 3 estados levados a sério. Os problemas reais são semânticas multi-tenant herdadas e a releitura fresca que ficou de fora em dois formulários.

- Numeração por-usuário: dono e membro mantêm contadores separados sobre o MESMO conjunto → mesmo número em documento de cliente (mutacoes.ts:116) — P1
- Recibo de membro grava com sucesso no tenant do membro e fica invisível ao dono (FormRecibo.tsx:76) — P1
- P2: maybeSingle trava membro de 2 orgs; FormOrcamento e FormEquipamento fazem merge sobre o CACHE, sem a releitura fresca que Kanban/OS fazem (lost update apaga fotos/assinatura)
- P3: useExcluir carimba sobre o cache (lixeira guarda versão velha); duplicarComoRascunho mantém datas do documento antigo; proximoNumeroDocumento não-atômico

### Design system (transversal) — 6,5/10

Fundação boa (tokens vanilla-extract→Tailwind de uma fonte só, componentes compartilhados, FC tematizado direito), mas 3 furos de token quebram AA em botões de TODA tela, o Início criou uma paleta paralela (mesmo status, 3 cores) e o 'Tentar de novo' tem 5 visuais.

- Tema escuro: texto de TODO botão primário 2,4:1 (--primary-foreground = primary-darker sobre primary) (global.css:110) — P1
- --destructive-foreground nunca definida: 'Excluir' herda cor do texto (branco sobre vermelho 3,2:1 no escuro) — P1
- Texto em warning/success/error default reprova AA no claro em ~15 pontos; o Badge tem o padrão certo e só não foi propagado — P1
- --muted-foreground = gray-500 (2,7:1) contamina placeholders e descrições do painel todo (global.css:79) — P1
- P2: mesmo status com 3 cores (Início hex próprio vs Badge vs Kanban tokens); 'Tentar de novo' com 5 visuais; botão 'Cobrar' WhatsApp 2,0:1; white-label sem recalcular texto do primário

### Acessibilidade (transversal) — 7/10

As telas OLLI novas têm a11y deliberada e acima da média (teclado paralelo a todo arraste, aria-label nos ícones, foco tratado). O que derruba são os TOKENS DE COR no claro e o chrome herdado (config 100% mouse, botões-ícone sem nome, labels não associados).

- 4 famílias de cor semântica 'default' falham AA como texto no claro (erro 3,2:1, aviso 1,9:1) em lugares críticos (campos.tsx:40 e ~15 pontos) — P1
- Campo (casca de TODOS os forms) não associa rótulo ao input: ~95 campos sem nome acessível (campos.tsx:34) — P1
- Painel de Configurações: tema/layout/fonte só funcionam com MOUSE (divs clicáveis, sem role/tabindex/teclado) (setting-button.tsx:96) — P1
- Botões só-ícone do chrome sem nome (hamburger, engrenagem, idioma, conta, colapsar, busca) — P1
- P2/P3: Badge de status 3,5-4:1 no claro; CampoMoeda sem aria-label (preço do item anônimo); grupo do menu é div (colapso inoperável por teclado); botão fechar anuncia 'Close' em pt-BR

### Segurança (transversal) — 6,5/10

Fundação anti-XSS/CSP exemplar e rara nesse porte, mas uma credencial de produção está pública no GitHub e o painel deixa membro gravar recibo/catálogo num tenant que a empresa nunca vê — gravação silenciosa em tenant errado é justamente o bug que a casa jurou não repetir.

- Credencial REAL da conta demo (plano Empresa ativo) commitada em repo PÚBLICO + nos docs — rotacionar a senha é a única correção real (login-form.tsx:30) — P1
- Recibo/produto de membro não-dono nasce no tenant do membro (RLS aceita o default auth.uid()) e some da empresa (FormRecibo.tsx:76, FormItemCatalogo.tsx:270) — P1
- Cadastro loga senha no console E posta em endpoint mock; reset não faz nada (register-form.tsx:29) — P1
- SIGNED_OUT via evento não limpa o cache do React Query: dado de um tenant vaza para o próximo login na mesma aba (userStore.ts:133) — P2
- P3: LoginAuthGuard renderiza o painel deslogado por um frame antes do redirect

### Performance (transversal) — 7/10

Runtime disciplinado (rotas lazy, memoização certa, otimista com rollback), mas o bundle inicial carrega ~100KB gzip de antd que nenhuma tela usa, o apexcharts bloqueia a rota padrão por um donut, e a camada de dados baixa tabelas inteiras (com blob) até 3x.

- antd + cssinjs inteiros no bundle inicial (~95KB gzip) sem NENHUM componente antd renderizado (App.tsx:30) — P1
- apexcharts (152KB gzip) bloqueia a renderização do Início — a rota padrão — por um único donut estático; deve ser lazy ou SVG (StatusDonutCard.tsx:3) — P1
- RouteLoadingProgress observa o document INTEIRO + setInterval de 5ms a cada navegação; trocar por useLocation (route-loading.tsx:33) — P1
- P2: react-dom escapou do vendor-core (re-baixado a cada deploy); MotionLazy importa domMax estático anulando o LazyMotion; MenuDaLinha declarado dentro da página (remount a cada tecla)
- P3: header sticky com backdrop-blur-xl re-borra a página a cada frame de scroll; transições animando propriedades de layout

---

## Plano de correção (por lote de implementação)

### Lote `catalogo` (3)

- 🔴 **ehProduto por formato apaga o modelo de produto sem marca ao editar**  
  `webapp/src/pages/olli/catalogo/FormItemCatalogo.tsx:65` · dados · esforço medio  
  → Parar de inferir o tipo pelo formato do objeto — a página já sabe o tipo. Passar `tipo` a itemParaRascunho e trocar os 4 usos de ehProduto(item) por `tipo === 'produto'` em ListaCatalogo; alternativa mínima: em linhaParaItem construir marca/modelo com chave explícita (l.marca || undefined) para `'marca' in` voltar true.
- 🟠 **Produto/serviço de membro nasce no tenant do membro (catálogo split-brain); gate de papel ausente**  
  `webapp/src/pages/olli/catalogo/ListaCatalogo.tsx:210` · dados · esforço medio  
  → Mesmo gate dos recibos: membro não-dono vê o catálogo somente-leitura (esconder 'Novo produto/serviço' e ações de linha quando ownerUserId!=null), mantendo a tradução do 42501 como rede de segurança.
- 🟡 **Salvar com busca ativa faz o item sumir sem feedback: parece falha, dono recadastra**  
  `webapp/src/pages/olli/catalogo/ListaCatalogo.tsx:418` · ux · esforço baixo  
  → Passar `aoSalvar` (hoje morta) e, nele, se a busca está preenchida e o item salvo não casa, limpar a busca; complemento: toast 'Produto salvo' via sonner já presente.

### Lote `orcamentos` (7)

- 🔴 **'2.5' (ponto decimal do teclado numérico) vira 25 — dinheiro e quantidade ×10 em silêncio**  
  `webapp/src/pages/olli/orcamentos/FormOrcamento.tsx:201` · dados · esforço baixo  
  → Em textoParaNumero, tratar ponto como decimal quando não há vírgula e há exatamente um ponto: `const s=t.trim(); if(!s.includes(',') && (s.match(/\./g)??[]).length===1) return Number(s); return Number(s.replace(/\./g,'').replace(',','.'));`. Aplicar também no desconto % (linha 774). Mantém '1.234,56'.
- 🟠 **Desconto % aceita negativo e o total fica MAIOR que o subtotal sem linha de desconto visível**  
  `webapp/src/pages/olli/orcamentos/FormOrcamento.tsx:408` · dados · esforço baixo  
  → Em validar(): `if(orc.desconto < 0) return 'O desconto não pode ser negativo.';` e no onChange do campo % rejeitar negativo (`patch({desconto: n>=0 ? n : 0})`). NÃO clampar dentro de calcularTotais (divergiria do app).
- 🟠 **Trava de 'já enviado' é código morto: salva por cima do documento que o cliente tem em mãos**  
  `webapp/src/pages/olli/orcamentos/FormOrcamento.tsx:424` · correcao · esforço medio  
  → Antes do upsert, reler `select('status, atualizado_em').eq('id', orc.id).maybeSingle()`; se edicaoBloqueada(data.status) ou data.atualizado_em > inicial.atualizadoEm, abortar com erro claro ('Este orçamento mudou em outro aparelho — feche e abra de novo').
- 🟡 **FormOrcamento e FormEquipamento salvam merge sobre o CACHE, sem releitura fresca (lost update apaga fotos)**  
  `webapp/src/pages/olli/orcamentos/FormOrcamento.tsx:440` · dados · esforço medio  
  → No submit, reler `select('dados').eq('id',...)` como o Kanban faz, usar o blob fresco como base do merge e aplicar só os campos que o form edita (revalidando edicaoBloqueada no status FRESCO). Idem FormEquipamento.tsx:148.
- 🟡 **Save que falha DEPOIS de gerar o número queima o número; o retry gera outro (buraco na sequência)**  
  `webapp/src/pages/olli/orcamentos/FormOrcamento.tsx:443` · correcao · esforço baixo  
  → Persistir o número no estado assim que gerado (`setOrc(o=>({...o,numero}))`) para o retry reutilizar o número já comprado. Mesmo padrão em recibos (FormRecibo.tsx:201) com useRef.
- 🟡 **Blob legado sem formasPagamento derruba a tela (TypeError na renderização)**  
  `webapp/src/pages/olli/orcamentos/FormOrcamento.tsx:868` · estado-vazio-erro · esforço baixo  
  → Ao montar o estado, aplicar defaults defensivos iguais ao emptyOrcamento do app: formasPagamento ?? {credito:false,debito:false,dinheiro:false,pix:true}, clienteNome ?? '', desconto ?? 0.
- 🟡 **Orçamento CONVERTIDO (que já virou recibo) abre para edição silenciosa por cima**  
  `webapp/src/pages/olli/orcamentos/FormOrcamento.tsx:65` · correcao · esforço baixo  
  → Incluir `convertido` em edicaoBloqueada (com o caminho de duplicar) e derivar a descrição do FormDialog do status real em vez de fixar 'Rascunho — o cliente ainda não recebeu'.

### Lote `agenda` (5)

- 🟠 **Roteiro do dia (visão padrão do celular) exibe o término ESTIMADO como horário real**  
  `webapp/src/pages/olli/agenda/index.tsx:188` · ux · esforço baixo  
  → Adicionar `views={{ listDay:{displayEventEnd:false}, listWeek:{displayEventEnd:false} }}`. Para não perder o término REAL na lista, quando emLista && ag.fim, acrescentar 'até HH:mm' na linha secundária.
- 🟠 **Botão ⋮ (reagendar no toque) tem 20px e vive a 45% de opacidade no celular**  
  `webapp/src/pages/olli/agenda/agenda.css:139` · a11y · esforço baixo  
  → `@media (pointer: coarse){ .olli-agenda .fc .ag-menu-btn{ width:40px; height:40px; opacity:.8; margin:-8px -6px -8px 0; } }` (área de toque grande via margem negativa). No desktop, opacidade de repouso 0.6.
- 🟡 **Esticar evento 'sem hora' na visão de mês grava término 00:00 que ninguém marcou**  
  `webapp/src/pages/olli/agenda/index.tsx:299` · dados · esforço baixo  
  → No início de aoRedimensionar: `if(arg.event.allDay){ arg.revert(); return; }` — redimensionar só faz sentido na grade de horas.
- 🟡 **Erro de 'Marcar como concluído' fica invisível atrás do modal do menu**  
  `webapp/src/pages/olli/agenda/index.tsx:321` · estado-vazio-erro · esforço baixo  
  → Passar o erro para dentro do MenuDoEvento (prop erro num <p role='alert'>) ou, no mínimo, fechar o menu no catch para o banner ficar visível.
- 🟡 **Voltar do celular para o desktop com 'Semana' (listWeek) deixa o seletor sem opção ativa**  
  `webapp/src/pages/olli/agenda/index.tsx:163` · correcao · esforço baixo  
  → Generalizar: `if(!ehCelular && vistaEscolhida && !VISTAS_DESKTOP.some(o=>o.v===vistaEscolhida)) setVistaEscolhida(null)`.

### Lote `campo-a11y` (2)

- 🟠 **Campo compartilhado sem htmlFor: ~95 campos em 9 formulários sem nome acessível**  
  `webapp/src/olli/components/campos.tsx:34` · a11y · esforço medio  
  → No Campo: `const id = useId()`, renderizar `<Label htmlFor={id}>` e clonar/repassar o id ao filho (Input/Textarea/Select/CampoMoeda já aceitam id). Ligar o erro via `id`+`aria-describedby` e setar `aria-invalid` quando houver erro. Remover os aria-label paliativos (DialogReagendar). Conserta os 9 forms de uma vez.
- 🟡 **CampoMoeda/CampoMascarado não aceitam aria-label: o PREÇO de cada item é um input anônimo**  
  `webapp/src/olli/components/campos.tsx:65` · a11y · esforço baixo  
  → CampoMoeda e CampoMascarado passarem ...rest/aria-label/aria-invalid ao <Input>; no item do orçamento usar `aria-label={'Preço de '+(item.nome||'item')}`.

### Lote `chrome-a11y` (4)

- 🟠 **Botões só-ícone do chrome sem nome: hamburger, engrenagem, idioma, conta, colapsar, busca**  
  `webapp/src/layouts/dashboard/header.tsx:32` · a11y · esforço baixo  
  → aria-label pt-BR em cada trigger: 'Abrir menu', 'Configurações de aparência', 'Trocar idioma', 'Minha conta', 'Recolher/Expandir menu', 'Buscar (Ctrl+K)'. Cobre também setting-button.tsx:80 e locale-picker (dedup do 'já sabido' do login).
- 🟠 **Painel de Configurações: tema/layout/fonte só funcionam com MOUSE (divs clicáveis)**  
  `webapp/src/layouts/components/setting-button.tsx:96` · a11y · esforço medio  
  → Cada grupo vira role='radiogroup' com aria-label; cada opção <button role='radio' aria-checked aria-label='Tema claro'> com focus-visible e navegação por setas. Indicar seleção com borda/check, não só cor.
- 🟠 **Engrenagem gira em loop infinito (motion decorativo) e o app não tem prefers-reduced-motion**  
  `webapp/src/layouts/components/setting-button.tsx:80` · a11y · esforço baixo  
  → Remover `animate-slow-spin` (ou girar só no hover com motion-safe). Adicionar no global.css: `@media (prefers-reduced-motion: reduce){ *,*::before,*::after{ animation-duration:.01ms!important; transition-duration:.01ms!important; } }`. Dedup login/design/casca.
- 🟡 **Cabeçalho de grupo do menu é <div onClick>: colapso inoperável por teclado**  
  `webapp/src/components/nav/vertical/nav-group.tsx:32` · a11y · esforço baixo  
  → Trocar a <div> do Group por <button type='button'> (o CollapsibleTrigger asChild passa a ter aria-expanded/foco de graça) com focus-visible.

### Lote `chrome-casca` (7)

- 🟠 **Cache do React Query só é limpo no logout do dropdown: troca de conta na mesma aba vaza dados do tenant anterior**  
  `webapp/src/store/userStore.ts:133` · dados · esforço medio  
  → No useAuthSync, ao receber SIGNED_OUT, chamar queryClient.clear() (via useQueryClient dentro do hook) e resetBrandColor(). No account-dropdown, mover clear()/resetBrandColor() do try para o finally. Defesa extra: incluir user.id na queryKey.
- 🟠 **Drawer do menu no celular não fecha ao tocar num item e o botão X foi escondido**  
  `webapp/src/layouts/dashboard/nav/nav-mobile-layout.tsx:18` · ux · esforço baixo  
  → Controlar o Sheet: `const [open,setOpen]=useState(false)` + `const {pathname}=useLocation()` + `useEffect(()=>setOpen(false),[pathname])`, passando open/onOpenChange. Ou remover `[&>button]:hidden` e envolver cada item com SheetClose.
- 🟠 **Cada item do menu é <a> dentro de <button>: ~30 stops de teclado, metade inúteis, HTML inválido**  
  `webapp/src/components/nav/vertical/nav-list.tsx:25` · a11y · esforço medio  
  → Renderizar o CollapsibleTrigger SÓ quando hasChild; para folha, renderizar <NavItem> direto (o RouterLink já é focável e navega com Enter). Vale para o menu vertical do desktop e do drawer mobile.
- 🟡 **Nome 'OLLI' da sidebar some para sempre depois de colapsar (maxWidth:'auto' é CSS inválido)**  
  `webapp/src/layouts/dashboard/nav/nav-vertical-layout.tsx:51` · visual · esforço baixo  
  → Trocar 'auto' por 'none' (ou valor animável), ou substituir o style inline por classes `max-w-0/max-w-[120px]` com overflow-hidden.
- 🟡 **HighlightText monta RegExp com o texto cru digitado — caractere especial lança SyntaxError**  
  `webapp/src/layouts/components/search-bar.tsx:23` · correcao · esforço baixo  
  → Escapar antes: `const safe = query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')` e usar `new RegExp('('+safe+')','gi')`.
- 🟡 **Busca usa replace() e apaga o histórico (Voltar quebra); atalho exibido como ⌘K num público Windows**  
  `webapp/src/layouts/components/search-bar.tsx:92` · ux · esforço baixo  
  → Trocar `replace(path)` por `push(path)`; detectar plataforma (`const isMac=/Mac|iPhone/.test(navigator.platform)`) e renderizar 'Ctrl' quando não-Mac.
- 🟡 **Seletor de idioma oferece Chinês/Inglês num painel 100% pt-BR e a troca deixa a UI híbrida**  
  `webapp/src/layouts/dashboard/header.tsx:34` · copy · esforço baixo  
  → Remover o LocalePicker do header (deixar só pt_BR) até existir tradução completa; ou no mínimo tirar zh_CN do LANGUAGE_MAP.

### Lote `data-layer` (4)

- 🟠 **select('*') sem limit/range: cap silencioso de 1000 do PostgREST corrompe KPIs, agenda e listas**  
  `webapp/src/olli/data.ts:19` · dados · esforço medio  
  → Em useOlliList, paginar com `.range(i,i+999)` em loop até esgotar (ou limit explícito + `{count:'exact'}`); quando `data.length < count`, expor flag `truncado` que as telas anunciam em aviso âmbar. Corrige Início, listas, Quadro, OS e recibos de uma vez.
- 🟠 **Listas/Quadro/Início baixam a tabela inteira COM o blob jsonb, e a mesma tabela 3x em caches paralelos**  
  `webapp/src/olli/data.ts:19` · performance · esforço medio  
  → Unificar a queryKey de orcamentos (uma leitura só, ordenar em memória nos useMemo existentes) e adicionar `colunas?` ao useOlliList para buscar só os espelhos, relendo o blob por id ao editar (padrão que o Kanban já usa). Em FaixaHoje, filtrar por dia no servidor.
- 🟠 **Numeração por-usuário e não-atômica: dono e membro (ou duas abas) emitem o MESMO número de documento**  
  `webapp/src/olli/mutacoes.ts:116` · dados · esforço medio  
  → Curto prazo: derivar o próximo número do MAIOR sufixo entre os documentos VISÍVEIS (técnica do proximoNumeroOs, imune ao bug) incluindo lixeira. Definitivo: RPC SECURITY DEFINER que incrementa atomicamente o contador do TENANT (owner_user_id) — resolve orçamentos, recibos e OS e a corrida select→upsert.
- 🟡 **useContextoDeEscrita usa maybeSingle: membro de 2 orgs tem TODA gravação bloqueada**  
  `webapp/src/olli/mutacoes.ts:61` · correcao · esforço baixo  
  → Trocar por `.order('criado_em',{ascending:true}).limit(1)` (determinístico, igual ao app), ou detectar N>1 e mostrar mensagem específica de multi-organização em vez do erro genérico.

### Lote `equipamentos` (3)

- 🟠 **'Desativado' ganha badge VERDE (regex casa 'ativa' dentro de 'Desativado'); 'Interditado' cai no cinza**  
  `webapp/src/olli/components/record-list-helpers.tsx:44` · correcao · esforço baixo  
  → Criar em equipamento.ts um Record<SituacaoEquipamento, BadgeVariant> espelhando STATUS_EQUIP_CORES do app (ativo=success, em_manutencao=warning, interditado=error, reserva=info) e passar a variant explícita ao Badge nas duas células (index.tsx:344 e 375).
- 🟡 **Filtro de situação fica PRESO sem UI para limpá-lo → lista vazia sem saída**  
  `webapp/src/pages/olli/equipamentos/index.tsx:224` · ux · esforço baixo  
  → Renderizar a barra de chips também quando `filtroSituacao !== 'todas'` (mesmo com 1 situação presente) e adicionar 'Limpar filtros' no estado vazio.
- 🟡 **Impossível DESVINCULAR o cliente do equipamento (o app desktop permite)**  
  `webapp/src/pages/olli/equipamentos/FormEquipamento.tsx:199` · ux · esforço baixo  
  → Adicionar botão 'Remover vínculo' ao lado do SeletorCliente quando clienteId existir (setClienteId(undefined)) — ou prop aoLimpar no SeletorCliente, que beneficia os demais forms.

### Lote `inicio` (3)

- 🟠 **FaixaHoje baixa a tabela agendamentos inteira ASC: acima de 1000 linhas a agenda de hoje vira vazio FALSO**  
  `webapp/src/pages/olli/inicio/FaixaHoje.tsx:20` · estado-vazio-erro · esforço medio  
  → Filtrar no servidor pelo intervalo do dia local: `.gte('inicio', inicioDoDiaISO).lt('inicio', fimDoDiaISO)`. Criar useAgendamentosDoDia ou estender useOlliList com filtros.
- 🟡 **Estado de erro do donut e de 'Orçamentos recentes' sem 'Tentar de novo'**  
  `webapp/src/pages/olli/inicio/StatusDonutCard.tsx:80` · estado-vazio-erro · esforço baixo  
  → Adicionar prop onRetry e o botão de retry do ParadosCard em ambos os cards; em index.tsx passar `onRetry={()=>orcQ.refetch()}`.
- 🟡 **semValor do 'Recebido no mês' calculado mas nunca exibido: recibo sem valor some da conta em silêncio**  
  `webapp/src/pages/olli/inicio/index.tsx:116` · dados · esforço baixo  
  → Compor o aviso com os dois contadores (semData e semValor) numa mesma string âmbar ou empilhar dois avisos no KpiDinheiroCard.

### Lote `landing` (4)

- 🟠 **Plano Empresa vende como pronto o que a fonte marca '(em breve)'**  
  `web/src/pages/index.astro:42` · copy · esforço baixo  
  → Reconciliar as duas superfícies: se Equipe/EquipeAoVivo já entregam, remover '(em breve)' de PLANOS_BASE; se parciais, acrescentar '(em breve)' na landing. Decidir junto com a pendência do paywall Empresa.
- 🟡 **Celular 3D cortado reto no rodapé em telas 640-1023px (overflow-hidden fatia o frame)**  
  `web/src/components/HeroDevices.tsx:83` · responsivo · esforço baixo  
  → No grid do hero (index.astro:83) trocar 'pb-24' por 'pb-24 sm:pb-32 lg:pb-24', ou reduzir o offset do celular para 'sm:-bottom-6'.
- 🟡 **Mockup inteiro lido por leitores de tela como conteúdo real; home sem <main>**  
  `web/src/components/HeroDevices.tsx:38` · a11y · esforço baixo  
  → aria-hidden='true' no div raiz do HeroDevices (não há interativo real dentro); e envolver as sections da home (index.astro:72-249) em <main>, com skip-link antes do header.
- 🟡 **FAQ com alvo clicável de 24px; '12x para planos pagos' mas só o Pro parcela; CTA 'Falar' abre login; 'Entrar' some no celular**  
  `web/src/pages/index.astro:198` · ux · esforço baixo  
  → Mover o padding px-6 py-5 do <details> para o <summary> (alvo ~64px); trocar por 'o Pro ainda sai em até 12×'; apontar 'Falar com a gente' para wa.me/mailto real; remover 'hidden sm:block' do 'Entrar'.

### Lote `login-auth` (8)

- 🟠 **'Esqueceu a senha?' e 'Cadastre-se' sem type=button submetem o form de login**  
  `webapp/src/pages/sys/login/login-form.tsx:115` · correcao · esforço baixo  
  → Adicionar `type='button'` nos Buttons das linhas 115 e 146 (e no ReturnButton.tsx:11 e demais forms). Idealmente, default type='button' no componente Button quando não especificado.
- 🟠 **'Criar conta' é fluxo morto: posta em endpoint mock inexistente em produção**  
  `webapp/src/pages/sys/login/register-form.tsx:16` · correcao · esforço medio  
  → Trocar a mutation por `supabase.auth.signUp({email,password})` com emailRedirectTo e feedback pt-BR; ou, se cadastro web não é desta onda, remover o CTA 'Cadastre-se' do login até o fluxo ser real.
- 🟠 **'Redefinir senha' não faz NADA: nem envia e-mail, nem dá feedback (só console.log)**  
  `webapp/src/pages/sys/login/reset-form.tsx:15` · correcao · esforço medio  
  → Chamar `supabase.auth.resetPasswordForEmail(email,{redirectTo: origin+'/nova-senha'})` com loading e toasts pt-BR; adicionar rules required + type=email; criar a rota /nova-senha (updateUser). Ou esconder o link até existir.
- 🟠 **Erro de login aparece em INGLÊS cru do Supabase ('Invalid login credentials')**  
  `webapp/src/store/userStore.ts:81` · copy · esforço baixo  
  → Mapear err?.code do AuthApiError para pt-BR antes do toast: invalid_credentials → 'E-mail ou senha incorretos', email_not_confirmed → 'Confirme seu e-mail antes de entrar', over_request_rate_limit → 'Muitas tentativas, aguarde'. Fallback atual para o resto.
- 🟠 **OAuth Google/Apple falha em silêncio absoluto (retorno {error} ignorado)**  
  `webapp/src/pages/sys/login/login-form.tsx:34` · estado-vazio-erro · esforço baixo  
  → Tornar async, checar `const {error}=await ...; if(error) toast.error('Não foi possível entrar com '+provider)`, com loading no botão. Enquanto o provider Apple não estiver configurado no Supabase, esconder o botão.
- 🟡 **Senha do usuário logada no console no cadastro (e e-mail no reset)**  
  `webapp/src/pages/sys/login/register-form.tsx:29` · seguranca · esforço baixo  
  → Remover os dois console.log (register-form.tsx:29 e reset-form.tsx:16). Nunca logar payload de credencial.
- 🟡 **'Lembrar de mim' é decorativo e botão 'Entrar' aceita duplo clique no loading**  
  `webapp/src/pages/sys/login/login-form.tsx:22` · ux · esforço baixo  
  → Remover o checkbox (honesto) ou implementar via sessionStorage quando remember=false; adicionar `disabled={loading}` (e aria-busy) ao botão de submit.
- 🟡 **Links de Termos e Privacidade apontam para './' e recarregam a página (perde o cadastro)**  
  `webapp/src/pages/sys/login/register-form.tsx:108` · ux · esforço baixo  
  → Apontar para as páginas reais da landing (/termos, /privacidade) com target=_blank rel=noopener; enquanto não existirem, remover o parágrafo (prometer termo inexistente é passivo jurídico).

### Lote `meu-negocio-planos` (7)

- 🟠 **Cor da marca salva nunca pinta o painel fora de Meu Negócio (white-label quebra ao recarregar)**  
  `webapp/src/olli/branding.ts:45` · correcao · esforço baixo  
  → Em pickBrandColor, inspecionar o blob: `const blob = empresa.dados as Record<string,unknown>|undefined;` checar `blob?.corMarca` (e demais chaves) antes de devolver null. Depois o setTimeout(0) da página pode ser removido.
- 🟠 **CNPJ/CPF inválido: clicar Salvar não dá NENHUM feedback (erro fora da viewport, focus no-op)**  
  `webapp/src/pages/olli/meu-negocio/index.tsx:249` · ux · esforço baixo  
  → CampoMascarado aceitar ...rest e repassar ao Input (data-erro passa a funcionar); após focus(), `el.scrollIntoView({block:'center'})`; quando validar() falha, mostrar na barra fixa 'Confira os campos destacados acima' em role=alert.
- 🟡 **Barra continua dizendo 'Alterações salvas' mesmo com novas edições não salvas**  
  `webapp/src/pages/olli/meu-negocio/index.tsx:636` · ux · esforço baixo  
  → Inverter a precedência: checar `sujo` ANTES de `salvoEm` (…: sujo ? 'Você tem alterações não salvas' : salvoEm ? '...' : 'Tudo salvo'), ou limpar salvoEm dentro de set().
- 🟡 **Falha de refetch em segundo plano substitui o formulário inteiro (com rascunho) pelo card de erro**  
  `webapp/src/pages/olli/meu-negocio/index.tsx:273` · estado-vazio-erro · esforço baixo  
  → Só renderizar o card de erro quando `!form` (nunca houve dado). Com form + isError, mostrar um <Aviso tom='erro'> no topo mantendo o formulário.
- 🟡 **White-label aplica a cor crua como primary sem guarda de contraste (Ciano = 1,66:1 em texto)**  
  `webapp/src/olli/branding.ts:24` · a11y · esforço medio  
  → Em applyBrandColor, calcular a foreground com contrasteTextoSobre(hex) e setar --primary-foreground (e --primary-texto para links); trocar os text-white hard-coded dos pills por text-primary-foreground. Alternativa: filtrar da paleta cores com contraste < 4,5:1.
- 🟡 **Navegar pelo menu (SPA) descarta o rascunho sem aviso — beforeunload não cobre react-router**  
  `webapp/src/pages/olli/meu-negocio/index.tsx:149` · ux · esforço medio  
  → Usar useBlocker do react-router quando `sujo`: bloquear a navegação e mostrar confirm ('Você tem alterações não salvas. Sair mesmo assim?').
- 🟡 **Técnico/gestor de empresa pagante vê 'Você está no plano Grátis'**  
  `webapp/src/pages/olli/planos/index.tsx:61` · dados · esforço medio  
  → Consumir useContextoDeEscrita: se membro não-dono, trocar a faixa de status por um card neutro 'O plano da sua empresa é gerenciado pelo dono' e esconder os CTAs de assinar.

### Lote `performance` (6)

- 🟠 **antd + cssinjs inteiros no bundle inicial (~95KB gzip) sem NENHUM componente antd renderizado**  
  `webapp/src/App.tsx:30` · performance · esforço medio  
  → Remover AntdAdapter de adapters (e o import), apagar src/components/upload/, src/layouts/dashboard/multi-tabs/ e o antd.adapter; tirar 'vendor-ui' do manualChunks e antd do optimizeDeps; `npm uninstall antd @ant-design/cssinjs`.
- 🟠 **apexcharts (152KB gzip) bloqueia a renderização do Início (rota padrão) por um único donut**  
  `webapp/src/pages/olli/inicio/StatusDonutCard.tsx:3` · performance · esforço baixo  
  → Carregar o Chart sob demanda: `const Chart = lazy(()=>import('@/components/chart').then(m=>({default:m.Chart})))` com o skeleton circular como fallback. Alternativa sem dependência: desenhar o donut em SVG puro e aposentar o apexcharts do painel.
- 🟠 **RouteLoadingProgress: MutationObserver no document inteiro + setInterval de 5ms a cada navegação**  
  `webapp/src/components/loading/route-loading.tsx:33` · performance · esforço baixo  
  → Trocar o MutationObserver por useLocation() do react-router (um useEffect com location.key como dependência) e animar a barra via transição CSS ou interval de 50ms.
- 🟡 **react-dom (maior módulo) escapou do vendor-core e caiu no chunk que muda a cada deploy**  
  `webapp/vite.config.ts:55` · performance · esforço baixo  
  → Usar a forma-função do manualChunks casando `node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]` → 'vendor-core' (ou adicionar 'react-dom/client' ao array). Verificar no stats.html.
- 🟡 **MotionLazy importa domMax estaticamente, anulando o LazyMotion (~380KB no bundle inicial)**  
  `webapp/src/components/animate/motion-lazy.tsx:1` · performance · esforço baixo  
  → Criar features.ts exportando domAnimation e usar `features={()=>import('./features').then(m=>m.default)}` com strict — o painel não usa layout/drag do motion.
- 🟡 **MenuDaLinha declarado DENTRO da página: todas as linhas remontam a cada tecla da busca**  
  `webapp/src/pages/olli/orcamentos/index.tsx:176` · performance · esforço baixo  
  → Içar MenuDaLinha para o escopo de módulo (como MenuAcoes/AcoesRecibo já fazem) recebendo onEditar/onDuplicar/onExcluir por props.

### Lote `recibos` (3)

- 🟠 **Membro não-dono emite recibo que nasce no tenant DELE, invisível para o dono**  
  `webapp/src/pages/olli/recibos/FormRecibo.tsx:76` · dados · esforço baixo  
  → Replicar o gate do Meu Negócio: via useContextoDeEscrita, se membro não-dono, esconder/desabilitar 'Novo recibo', Editar e Excluir com aviso ('Recibos são emitidos pelo dono da conta'); bloquear também quando o papel é DESCONHECIDO. Defesa em profundidade: em useSalvar, rejeitar quando ownerUserId!=null e a tabela não está no set do dono.
- 🟡 **Linha degradada imprime 'R$ 0,00' onde o valor é desconhecido**  
  `webapp/src/pages/olli/recibos/index.tsx:270` · estado-vazio-erro · esforço baixo  
  → `const v = recibo?.valorRecebido ?? linha.valor_recebido; exibir v==null ? '—' : reais(v)` nas duas vistas (desktop e mobile card).
- 🟡 **Visitar /recibos baixa TODOS os orçamentos (blob inteiro) mesmo sem abrir o formulário**  
  `webapp/src/pages/olli/recibos/FormRecibo.tsx:91` · performance · esforço baixo  
  → Montar o dialog condicionalmente (`{formAberto && <FormRecibo/>}`) ou adicionar suporte a `enabled` no useOlliList e passar enabled=aberto.

### Lote `seguranca` (1)

- 🟠 **Credencial REAL da conta demo (plano Empresa ativo) commitada em repositório PÚBLICO**  
  `webapp/src/pages/sys/login/login-form.tsx:30` · seguranca · esforço baixo  
  → 1) TROCAR a senha da conta demo no Supabase JÁ (rotacionar é a única correção real — a string fica no histórico do git). 2) Ler de import.meta.env.VITE_DEMO_* num .env.local não commitado. 3) Remover a senha dos dois docs/*.md. 4) Avaliar tornar o repo privado.

### Lote `tema-claro-tokens` (5)

- 🟠 **--muted-foreground = gray-500 (2,7:1) contamina placeholders, descrições e o 'Ou continue com'**  
  `webapp/src/global.css:79` · a11y · esforço baixo  
  → No tema claro, trocar para gray-600: `--muted-foreground: var(--colors-palette-gray-600)` (#637381 = 4,9:1). O dark já usa gray-400 e está ok. Correção única que conserta todo texto muted do painel claro.
- 🟠 **--primary-foreground reprova AA (2,4:1 no escuro): texto de TODO botão primário quase invisível**  
  `webapp/src/global.css:110` · a11y · esforço baixo  
  → Definir `--primary-foreground: var(--colors-common-white)` nos DOIS temas (5,03:1 sobre #0B6FCE) — linhas 75 e 110.
- 🟠 **--destructive-foreground nunca definida: 'Excluir' herda a cor do texto (3,2:1 no escuro / preto no claro)**  
  `webapp/src/global.css:82` · a11y · esforço baixo  
  → Adicionar `--destructive-foreground: #FFFFFF;` nos dois blocos de tema; idealmente escurecer o vermelho do botão no claro (error-dark #B71D18) para o branco passar folgado.
- 🟠 **Texto em warning/success/error/info 'default' reprova AA no claro em ~15 pontos**  
  `webapp/src/olli/components/campos.tsx:40` · a11y · esforço medio  
  → Adotar o padrão do Badge para TEXTO: `text-warning-darker dark:text-warning` (#7A4100 ≈8:1), `text-error-dark dark:text-error` (#B71D18 ≈6,6:1), `text-success-dark dark:text-success` — ou criar utilitárias text-*-legivel no global.css. Aplicar em campos.tsx:40, FormDialog:60, KpiDinheiroCard:96, ParadosCard:125, task-card:69, orcamentos:369/415, FormCliente:390-391, ListaCatalogo:80/92, meu-negocio:632/707.
- 🟠 **'Sair' em #FFAB00 sobre branco = 1,6:1 (a ação mais importante do dropdown quase invisível)**  
  `webapp/src/layouts/components/account-dropdown.tsx:72` · a11y · esforço baixo  
  → Trocar `text-warning` por `text-error-dark` (#B71D18 = 6,6:1 no branco) com `dark:text-warning` se quiser manter o âmbar no escuro; amarelo puro sobre branco nunca passa.

### Lote `a11y-global` (2)

- 🟡 **Badge de status (usado em toda lista) com contraste 3,5-4,0:1 no tema claro**  
  `webapp/src/ui/badge.tsx:19` · a11y · esforço baixo  
  → Usar o tom -darker no texto do claro (warning-darker #7A4100, success-darker) ou reduzir a opacidade do fundo para /15 e escurecer o texto; manter os -light no dark.
- 🟡 **Campo de busca das listas sem rótulo — só placeholder 'Buscar…'**  
  `webapp/src/olli/components/RecordListPage.tsx:259` · a11y · esforço baixo  
  → `aria-label={'Buscar em '+title}` e type='search' no Input; bônus: aria-live='polite' no contador de resultados.

### Lote `clientes` (4)

- 🟡 **Abrir cliente para editar dispara ViaCEP no mount e sobrescreve cidade/UF corrigidas à mão**  
  `webapp/src/pages/olli/clientes/FormCliente.tsx:164` · dados · esforço baixo  
  → Inicializar o ref com o CEP inicial: `const ultimoCepBuscado = useRef(soDigitos(cliente?.cep))` — o mount não rebusca e a busca só dispara quando o USUÁRIO altera o CEP (paridade com o app).
- 🟡 **Corrida do CEP: resposta obsoleta preenche endereço depois de apagar o CEP**  
  `webapp/src/pages/olli/clientes/FormCliente.tsx:167` · correcao · esforço baixo  
  → No branch `cep.length !== 8`, adicionar `cepEmFoco.current = '';` junto do reset de ultimoCepBuscado — a resposta em voo passa a ser descartada.
- 🟡 **Telefone legado >11 dígitos truncado em silêncio ao salvar (+55 vira DDD 55)**  
  `webapp/src/pages/olli/clientes/FormCliente.tsx:113` · dados · esforço baixo  
  → Em validar(): `if(campos.telefone.length > 11) e.telefone='Telefone com dígitos demais — confira o número.'`. Alternativa: se o telefone não mudou, regravar o original em vez de remascarar.
- 🟡 **Aviso de duplicidade sem live region: leitor de tela nunca ouve e cadastra o duplicado**  
  `webapp/src/pages/olli/clientes/FormCliente.tsx:324` · a11y · esforço baixo  
  → Adicionar `role='status'`/`aria-live='polite'` ao div do aviso (ou um <span sr-only role='status'> anunciando a frase-título quando duplicados.length>0).

### Lote `design-system` (2)

- 🟡 **Mesmo status do funil tem 3 cores diferentes (Início hex próprio vs Badge vs Kanban tokens)**  
  `webapp/src/pages/olli/inicio/helpers.ts:89` · visual · esforço medio  
  → Eliminar o mapa de hex de helpers.ts: usar getStatusVariant/StatusBadge em ParadosCard e RecentOrcamentosCard e derivar as cores do donut dos tokens da paleta. Nos KPIs, usar primary/warning/success/info do tema (fora #F59E0B e #8B5CF6).
- 🟡 **Botão 'Cobrar' (WhatsApp) branco sobre #25D366 = 2,0:1**  
  `webapp/src/pages/olli/inicio/ParadosCard.tsx:135` · a11y · esforço baixo  
  → Texto escuro sobre o verde (text-[#0A2547] = 7,7:1) ou fundo verde escuro #128C7E com branco; extrair para constante WHATSAPP_VERDE compartilhada e padrão único de 'ação WhatsApp'.

### Lote `ordens-servico` (1)

- 🟡 **Checklist marcado pelo técnico no celular é revertido ao salvar; a copy promete o contrário**  
  `webapp/src/pages/olli/ordens-servico/FormOs.tsx:200` · dados · esforço medio  
  → Guardar o snapshot semeado (useRef) e mesclar por id: item cujo `feito` o painel NÃO alterou herda o valor da linha FRESCA (mudança do técnico vence). No mínimo, corrigir a copy para 'As fotos anexadas em campo são preservadas'.

### Lote `quadro` (2)

- 🟡 **Anúncios/instruções do drag saem em INGLÊS no leitor de tela**  
  `webapp/src/features/kanban/components/kanban-board.tsx:152` · a11y · esforço baixo  
  → Passar `accessibility={{ screenReaderInstructions, announcements }}` com frases pt-BR usando o rótulo da coluna (COLUNAS/TITULOS de colunas.ts).
- 🟡 **Alça de arrastar e botão do menu em gray-500 = 2,7:1 (os dois únicos controles do card)**  
  `webapp/src/features/kanban/components/task-card.tsx:112` · a11y · esforço baixo  
  → Trocar a cor base dos dois ícones de `text-text-disabled` para `text-text-secondary` (#637381, 4,9:1), mantendo os hovers.

---

*Gerado da síntese do workflow `wf_d35ddf0b-e67`. Fonte de verdade dos achados é o código.*
