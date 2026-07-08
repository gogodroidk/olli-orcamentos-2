# FEATURE_MATRIX — estado honesto vs. PROMPT_MESTRE

> Classificação: **Funcional** (usa de ponta a ponta) · **Parcial** (existe mas incompleto) ·
> **Visual** (tela existe, não integrada) · **Ausente** · **Bloqueado** (depende de passo humano externo).
> Referências: seções do PROMPT_MESTRE.md. Atualizado 2026-07-08.

## Núcleo comercial (o ciclo que paga as contas)

| Funcionalidade | Mestre | Status | Evidência / o que falta |
| --- | --- | --- | --- |
| Clientes (CRUD + busca) | §12 | **Funcional** | `ClientesScreen`, sync, RLS |
| Leads com funil/origem/etapas | §12.1 | **Ausente** | não existe entidade lead |
| Locais de atendimento separados do cliente | §12.3 | **Ausente** | endereço vive no cliente |
| Orçamento em etapas (serviços, produtos, fotos, desconto) | §13.1 | **Funcional** | `NovoOrcamentoScreen` + steps |
| Opções comerciais (econômica/recomendada/premium) | §13.3 | **Ausente** | |
| Status expandido do orçamento | §13.4 | **Parcial** | rascunho/enviado/aprovado/recusado existem; sem versões, sem "visualizado" persistido no fluxo |
| Versões de proposta (nunca sobrescrever enviada) | §13.5 | **Ausente** | |
| PDF com modelos + cor da marca | §13.6 | **Funcional** | `pdfGenerator.ts`, 6 modelos |
| Logo sem distorção no PDF | §13.6 | **Parcial** | bug conhecido: logo corta/divide em quebra de página (Onda PDF v2) |
| Foto de capa escolhida pelo usuário | §13.6 | **Ausente** | campo `fotoCapaUri` planejado |
| Link público do orçamento (`/o/<token>`) | §35 | **Funcional** | `worker/src/link.js`, `clienteLink.ts` |
| Portal: cliente APROVA/RECUSA com motivo no link | §35 | **Parcial** | cliente vê; aprovação registrada existe no link, sem seleção de opções/assinatura/motivo estruturado |
| Assinatura do cliente | §13/§35 | **Ausente** | |
| Recibos + vínculo recibo↔orçamento | §22 | **Funcional** | `EmitirReciboScreen({orcamentoId})` |
| Ordem de serviço (entidade própria) | §14 | **Ausente** | maior buraco do ciclo comercial |
| App do técnico (checklist, check-in, materiais) | §15 | **Ausente** | depende de OS |
| Agenda (dia/semana, desktop semanal) | §18 | **Funcional** | `AgendaScreen`, `AgendaDesktopScreen` |
| Despacho/drag-and-drop/por técnico | §18 | **Ausente** | |
| Financeiro operacional (a receber/pagar, fluxo de caixa) | §22 | **Ausente** | só valor do orçamento/recibo |

## Plataforma e contas

| Funcionalidade | Mestre | Status | Evidência / o que falta |
| --- | --- | --- | --- |
| Auth e-mail + Google (web) obrigatório | §1/§46 | **Funcional** | v3 `15f245e` |
| Login Google NATIVO (Android) | §32 | **Bloqueado** | falta OAuth client Android (SHA-1) no console |
| Multiempresa: organizações/membros/convites/papéis | §10 | **Parcial** | Onda 2 em andamento: migration escrita, não aplicada; UI pronta não commitada |
| RLS multi-tenant testada | §10.5 | **Parcial** | T1–T7 escritos, não executados — ver RLS_MATRIX.md |
| Permissões granulares (ver custos/margens, financeiro) | §21 | **Parcial** | `usePermissao` com 4 papéis; granularidade por permissão individual ausente |
| Migração: org individual por usuário existente | §10.5 | **Ausente** | decidido (D-09), não implementado |
| Auditoria (`audit_logs`, `sessions_audit`) | §10.2 | **Parcial** | `acessos_equipe` (login/app_open) só; sem audit log de dados |
| Filiais/departamentos/turnos | §10.3 | **Ausente** | Camada 3, não é agora |
| Planos e entitlements central | §25 | **Parcial** | `RECURSOS_POR_PLANO` (Set) funcional; falta chave+limite (PLAN_ENTITLEMENTS.md) |
| Stripe mensal/anual/12x/Empresa + webhook | §25.6 | **Funcional*** | código completo; *12x/Empresa bloqueados por config no dashboard Stripe |
| Portal de assinatura (upgrade/downgrade/cancelar) | §25.6 | **Funcional** | billing portal via worker |
| Marca OLLI no PDF do grátis | §25.1 | **Ausente** | decidido (D-07), implementar na onda PDF v2 |

## Web, comunicação, integrações

| Funcionalidade | Mestre | Status | Evidência / o que falta |
| --- | --- | --- | --- |
| Dashboard desktop com dados reais | §26 | **Funcional** | v4: sidebar, KPIs, tabelas |
| Dashboard Empresa (denso) vs Pessoal | §26 | **Ausente** | depende de `useTipoConta` (Onda 2) |
| Landing de marketing na raiz do domínio | §26 | **Ausente** | raiz hoje redireciona para o app |
| E-mails transacionais (provider próprio) | §24.2 | **Bloqueado** | decisão Resend tomada; falta conta/API key (5 min do dono) |
| WhatsApp suporte (5511941727487) | §24.1 | **Parcial** | env + guard prontos; falta CTA em toda superfície de erro/ajuda |
| WhatsApp para clientes (compartilhar orçamento/recibo) | §24.1 | **Funcional** | share/wa.me |
| Google Calendar sync | §18.1 | **Bloqueado** | código atrás de flag (`googleAgenda.ts`); falta OAuth Android |
| Mapas embutidos / rotas | §18.2 | **Bloqueado** | billing Google; deep-link para Maps FUNCIONA hoje (`rotas.ts`) |
| Localização da equipe (captura) | §19 | **Parcial/Bloqueado** | `localizacoesequipe` schema + tela prontos; captura nativa exige expo-location = prebuild único final; web usa navigator.geolocation |
| Notificações push | §34 | **Ausente** | expo-notifications presente; sem arquitetura de eventos |
| Automações (motor evento→ação) | §30 | **Ausente** | |

## IA, vertical HVAC, qualidade

| Funcionalidade | Mestre | Status | Evidência / o que falta |
| --- | --- | --- | --- |
| Voz para orçamento (nuvem Gemini) | §31 | **Funcional** | `vozNuvem.ts`, v6 |
| Olli Chat / assistente | §31 | **Funcional** | `olliAssistente.ts`, cota 3/mês no grátis |
| Diagnóstico HVAC (698 códigos offline + IA aterrada em manuais) | §16 | **Funcional** | v5, `hvac_chunks` |
| Equipamentos do cliente (cadastro, série, BTU, histórico) | §16.1 | **Ausente** | |
| PMOC | §16.3 | **Ausente** | estrutura futura |
| Manutenção recorrente/contratos | §16.4 | **Ausente** | |
| Pacotes elétrica/hidráulica/pintura | §17 | **Ausente** | pós-núcleo |
| Offline-first (SQLite + sync) | §20 | **Funcional** | `database.ts` + `cloudSync.ts` (pull confia na RLS, sem `.eq(user_id)`) |
| Fila formal de sync (tombstones, backoff, tela de diagnóstico) | §20 | **Parcial** | sync robusto com guard de timestamp; sem fila/tombstones formais |
| Backup automático versionado | §20 | **Funcional** | v2, `autoBackup.ts` |
| Motion system (skeleton, pressable, countup, celebração) | §27/§28 | **Parcial** | componentes existem; aplicação incompleta nas telas |
| Relatórios (faturamento, conversão) | §36 | **Parcial** | relatórios básicos gateados no Pro; sem funil/motivos de perda/margem |
| LGPD (exportação, exclusão de conta, consentimento) | §37 | **Parcial** | exclusão de conta existe; sem exportação estruturada/consentimentos |
| Observabilidade (logs estruturados, painel admin) | §38 | **Parcial** | `worker/src/admin.js` + analytics; sem painel completo |
| Testes automatizados (unit/RLS/E2E) | §39 | **Parcial** | typecheck como gate; RLS T1–T7 escritos; sem suíte E2E |
