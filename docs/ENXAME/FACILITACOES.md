# FACILITAÇÕES — menos cliques / sinergia (backlog vivo)

> Filosofia-mãe do dono: menos cliques, cada botão leva a outro, facilitar a vida do usuário.
> Mapa feito na Wave 12 (U3, 2026-07-17). Quase tudo é **portar um padrão que já existe numa superfície pra outra** (baixo risco).
> `[x]` feito · `[ ]` aberto. Detalhe completo (18 itens) no journal `wf_5a77d18c-537`.

## Feito
- [x] **Autocomplete de e-mail no login** (Wave 12) — app+painel, testado ao vivo. O exemplo do dono.
- [x] **CTA "Novo orçamento" do painel** (Wave 13, F1) — lê `?novo=1` e abre direto; + `?cliente=` pré-preenche a busca.
- [x] **Ações contextuais do cliente no painel** (Wave 13, F1) — Novo orçamento (cliente pré-selecionado) / Ver orçamentos / WhatsApp. (Agendar omitido — fora do cluster.)
- [x] **Duplicar orçamento no app** (Wave 13, F2) — botão na `VisualizarOrcamentoScreen` (novo id/número, status rascunho).
- [x] **"Criar OS" direto do orçamento aprovado no app** (Wave 13, F2) — botão quando `status==='aprovado'` + CTA logo após a aprovação.
- [x] **Catálogo abre cheio no wizard do app** (Wave 13, F2) · **"Criar orçamento pra este cliente" no Equipamento** (F2) · **chips 7/15/30 na validade do painel** (F1) · **técnico logado pré-selecionado na OS do painel** (F1) · **"Ligar" no menu do cliente** (F2). app tc+test + webapp tsc = 0.
- [ ] **NOVO (Wave 13, follow-up): barra de ações do orçamento lotada** — `VisualizarOrcamentoScreen` agora tem até 9 botões numa flex-row sem wrap; apertado em tela estreita. Fix: `flexWrap`/scroll horizontal ou agrupar em "⋯".

## TOP (ALTO impacto — próxima onda de código)
- [ ] **CTA "Novo orçamento" do painel não abre nada** — `inicio/WelcomeHeader.tsx` linka `/orcamentos?novo=1` mas `orcamentos/index.tsx` só lê `?status`, nunca `?novo`. O botão mais usado faz promessa vazia. Fix: ler `?novo` e chamar `abrirNovo()`.
- [ ] **Ações contextuais do cliente no painel** — lista de Clientes do painel só tem Editar/Excluir; o app já tem "Novo orçamento (prefill)/Ver orçamentos/Agendar/WhatsApp". Portar pro `clientes/index.tsx`.
- [ ] **Duplicar orçamento no app** — o painel tem `duplicarComoRascunho`; o app não tem em lugar nenhum. Portar pra `VisualizarOrcamentoScreen`.
- [ ] **Painel: gerar OS de orçamento aprovado** — `FormOs.tsx` não aceita `orcamentoId`; o app já converte (`criarOSDeOrcamento`). Add `orcamentoId?` + ação "Gerar OS" no menu.
- [ ] **App: "Criar OS" direto do orçamento aprovado** — hoje é caminho de 4-5 toques (aba Ordens→+→De um orçamento→achar→selecionar). Botão direto no `VisualizarOrcamentoScreen` quando `status==='aprovado'` + oferecer no momento da aprovação.
- [ ] **Painel: "Copiar link"/"Enviar WhatsApp" na lista de orçamentos** — hoje só "Imprimir PDF"; o link do cliente só é gerado no celular. Expor endpoint no worker (`link.js`) + ações no menu.

## MÉDIO
- [ ] Catálogo mostra tudo ao abrir "Do catálogo" no wizard do app (hoje exige digitar 1+; painel já faz certo) — `Step2Itens.tsx`.
- [ ] Cards do Quadro (kanban) clicáveis abrindo o orçamento (hoje só arrastam/mudam status) — `task-card.tsx`.
- [ ] "Duplicar item" no catálogo (produtos/serviços), ausente nas 2 superfícies.
- [ ] "Criar orçamento pra este cliente" no detalhe do Equipamento (já tem `clienteId` em mãos) — `EquipamentoScreen`.
- [ ] Aviso de cliente duplicado nos modais de cliente do APP (o painel já tem) — `Step1Cliente`/`ClientesScreen`.
- [ ] "Criar orçamento com este diagnóstico" no painel (o app já faz) — `PorCodigo/PorSintoma`.
- [ ] Chips "7/15/30 dias" na validade do orçamento no painel (o app já tem) — `FormOrcamento` web.

## BAIXO / smart-defaults
- [ ] "Ligar" (tel:) no menu do cliente ao lado do WhatsApp — `ClientesScreen`.
- [ ] Técnico logado pré-selecionado ao criar OS no painel — `FormOs`.
- [ ] Lembrar a última combinação de formas de pagamento por empresa (hoje sempre só Pix).
- [ ] `?cliente=` na URL da lista de orçamentos do painel (habilita "Ver orçamentos deste cliente").

> Padrão dominante: **sinergia entre telas** — o produto já tem as peças; falta ligar uma na outra. É exatamente o "cada botão leva a outro" do dono.
