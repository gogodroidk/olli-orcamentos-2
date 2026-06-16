---
name: project-olli-analise-concorrente
description: "Análise completa do app concorrente \"Orçamento PRO\" para base do app OLLI ORÇAMENTOS Android"
metadata: 
  node_type: memory
  type: project
  originSessionId: b38e5d95-9e9b-4e00-9db5-2d7962cbad70
---

App concorrente analisado: **Orçamento PRO** (usado por empresa GR Tech Refrigeração, São Paulo/SP).
Objetivo do usuário: criar app Android similar chamado **OLLI ORÇAMENTOS** para Samsung S24.

**Why:** O usuário quer replicar as funcionalidades e UX do app concorrente com identidade visual própria "OLLI ORÇAMENTOS".

**How to apply:** Usar este mapeamento como spec completo do app a ser desenvolvido. Manter estrutura de 4 abas de navegação inferior e fluxo de 4 etapas para criação de orçamento.

---

## NAVEGAÇÃO INFERIOR (Bottom Nav - 4 abas)
1. Início (Home/Dashboard)
2. Catálogo
3. Meu negócio
4. Suporte

---

## TELA 1 - HOME (Dashboard)
- Header: Logo + "Olá, [Nome]!" + "Meu perfil >"
- Barra de busca: "Buscar orçamentos"
- Banner azul de assinatura (monetização)
- Seção "Comece por aqui":
  - Botão azul grande: "+ Novo Orçamento"
  - Botão cinza: "Orçamento com modelo"
  - Botão cinza: "Emitir Recibo"
- Seção "Orçamentos (ult. 3 meses)" - cards horizontais roláveis:
  - Meus Orçamentos (contador)
  - Orçamentos Abertos (contador)
  - Orçamentos Aprovados (contador, parcial)
- Seção "Outras tarefas":
  - Meus Recibos (contador)
  - Indique para amigos

---

## TELA 2 - CRIAR ORÇAMENTO (4 etapas em tabs)
### Etapa 1: Cliente
- Número do orçamento no header
- Campo: selecionar cliente (obrigatório)
- Footer fixo sempre visível: Subtotal | Botão Desconto | Valor Total | "Revisar e enviar" | "Próximo"

### Etapa 2: Valores e Itens
- Lançamento detalhado:
  - Tab: Serviços (lista com checkbox + busca)
  - Tab: Produtos, peças e materiais (lista com checkbox + busca)
  - FAB (+) para cadastrar novo item
  - Footer: Limpar | Salvar e adicionar

### Etapa 3: Detalhes
- Descontos (R$ ou %)
- Formas de pagamento e parcelas
- Laudo técnico
- Data de emissão
- Data da visita técnica
- Data da prestação do serviço
- Condições contratuais e garantia
- Campos personalizados
- Informações adicionais

### Etapa 4: Personalização
- Fotos dos serviços
- Depoimentos e Avaliações
- Slogan ou Descrição da empresa
- Assinaturas digitais (exibir | solicitar)
- Validade do orçamento
- Aprovação de orçamento (botão cliente)
- Recusa do orçamento (configurável)

---

## TELA 3 - NOVO CLIENTE
Campos: Nome* | Telefone | CPF | CNPJ | Endereço | Complemento | Estado (dropdown) | Cidade | CEP
Botão: Salvar

---

## TELA 4 - CADASTRAR SERVIÇO
Campos: Nome do serviço* | Preço de venda* | Unidade de medida (dropdown) | Custo | Descrição (0/2000) | Foto
FAB: câmera/foto

---

## TELA 5 - CADASTRAR PRODUTO/PEÇA/MATERIAL
Campos: Nome* | Preço de venda* | Marca | Modelo | Unidade de medida (dropdown) | Custo | Descrição
FAB: câmera/foto

---

## TELA 6 - CATÁLOGO
- Catálogo de serviços (contador)
- Catálogo de peças e materiais (contador)
- Catálogo de clientes (contador)

---

## TELA 7 - MEU NEGÓCIO
- Dados do negócio
- Personalizar orçamento (progresso X/Y preenchidas)
- Modelos de orçamento (contador)
- Depoimentos e avaliações (contador)
- Recibos (contador)

---

## TELA 8 - EMITIR RECIBO (2 etapas)
### Etapa 1: Infos Básicas
- Associar a Orçamento existente OU selecionar Cliente
- Toggle: Exibir assinatura digital (Sim/Não)

### Etapa 2: Valores Recebidos
- Adicionar valor recebido (valor + forma de pagamento)
- Adicionar serviços prestados
- Lista de valores e serviços adicionados
- Footer: Valor Total Recebido | "Revisar e Enviar"

---

## TELA 9 - VISUALIZAR ORÇAMENTO (após criação)
### Aba Link Web:
- Status: "Aguardando assinatura do cliente..." / "Em aberto" / etc.
- Preview do orçamento: logo empresa, dados, cliente, serviços, condições, garantia
- FAB flutuante: "Recibo" (gerar recibo a partir do orçamento)
- Footer: Valor Total | Editar | Enviar novamente

### Aba PDF:
- Preview do documento PDF do orçamento

---

## TELA 10 - COMPARTILHAR ORÇAMENTO (tela de sucesso)
- Fundo escuro
- "Orçamento criado com sucesso!"
- Link web copiável
- Botão: "Enviar link do orçamento" (share nativo)
- Opções secundárias: Enviar PDF | Salvar como Modelo
- Link: Voltar ao início

---

## TELA 11 - RECIBO EM PDF (visualização)
- PDF gerado com: logo + nome empresa + tipo "Recibo de pagamento" + dados empresa + cliente + tabela itens + valor + forma pgto + data + assinatura
- Footer: Editar | Enviar recibo

---

## TELA 12 - PERFIL
- Status assinatura PRO
- Referral (indicar amigos)
- Dados pessoais: Nome | Email | CPF
- Login via Google
- Termos e política
- Notificações (toggle)
- Restaurar assinatura

---

## DESIGN SYSTEM DO CONCORRENTE
- Cor primária: Azul (#2563EB aproximado)
- Fundo: Branco / Cinza claro para cards
- Header: Preto/escuro
- Botão primário: Azul cheio, bordas arredondadas
- Botão secundário: Outline
- FAB: Azul com bordas arredondadas grandes
- Cards: Bordas arredondadas, fundo cinza claro, seta ">" à direita
- Ícone "?" para ajuda contextual em quase todos os campos/seções
- Status badge: vermelho/rosa para "Obrigatório", azul para normal
- Tabs com sublinhado azul no item ativo
- Toggle azul (padrão Material)
- Tipografia: Sans-serif, bold para títulos de seção

---

## MODELO DE NEGÓCIO DO CONCORRENTE
- App por assinatura (PRO)
- Funcionalidade de referral ("Indique para amigos")
- Link web público para o cliente visualizar o orçamento online
- PDF gerado no app

---

## FUNCIONALIDADES-CHAVE A REPLICAR NO OLLI
1. Criação de orçamento em 4 etapas guiadas
2. Catálogo de serviços/produtos/clientes
3. Link web do orçamento para o cliente
4. Geração de PDF (orçamento e recibo)
5. Assinatura digital
6. Emissão de recibo vinculado ao orçamento
7. Status do orçamento (Em aberto / Aguardando assinatura / Aprovado)
8. Condições contratuais e garantia
9. Desconto em R$ ou %
10. Formas de pagamento e parcelas
11. Modelos de orçamento reutilizáveis
12. Personalização visual do orçamento (logo, slogan, fotos, depoimentos)
