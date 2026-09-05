# FEATURE_MATRIX — estado verificável do produto

> Baseline de 2026-08-26; frentes transversais reconciliadas em 2026-09-01.
>
> Esta matriz descreve o que existe **neste repositório**. Ela não transforma código
> local em prova de deploy, migração aplicada, credencial válida ou aceite em aparelho.
> Quando isso depende de ambiente externo, a coluna deixa a pendência explícita.

## Como ler

- **Funcional no repo:** fluxo implementado e coberto por typecheck, teste automatizado
  ou build aplicável. Ainda pode exigir aceite real em dispositivo/produção.
- **Parcial:** há um fluxo útil, mas falta parte relevante da promessa de produto.
- **Bloqueado externo:** a parte independente está no repo, porém credencial, conta,
  configuração ou mudança de produção ainda depende de autorização/ação externa.
- **Planejado:** não deve aparecer em marketing nem venda como funcional.

## Núcleo comercial

| Capacidade | Estado verificável | Evidência e limite honesto |
| --- | --- | --- |
| Clientes: cadastro, edição, busca e sync | **Funcional no repo** | Telas mobile/desktop/web, SQLite e `cloudSync.ts`. O schema live não foi revalidado nesta etapa. |
| Leads e CRM por origem/etapa | **Parcial** | Há visão comercial/kanban baseada em orçamentos; não existe ainda uma entidade completa de lead com origem, atividades e conversão. |
| Locais/unidades separados do cliente | **Parcial** | Endereços existem nos clientes e há `local_id` em ativos PMOC, mas o cadastro reutilizável de unidades ainda não fecha todo o fluxo. |
| Orçamento em etapas | **Funcional no repo** | Itens, produtos, fotos, desconto, garantia, condições, validade e observações no mobile/web. |
| Escolha e personalização de modelo | **Funcional no repo** | Modelos, cor/marca, capa e dados da empresa existem; revisão visual em aparelho e PDFs reais permanece gate de release. |
| Opções econômica/recomendada/premium numa proposta | **Planejado** | Ainda não existe proposta multiopção com escolha do cliente e totais independentes. |
| Status e histórico do orçamento | **Funcional no repo** | Rascunho, envio, visualização/interação, aprovação, recusa e espera de assinatura aparecem no fluxo; a telemetria live não foi revalidada. |
| Versões sem sobrescrever proposta enviada | **Funcional no repo** | Entidade e fluxo de versões implementados; snapshots congelados continuam sendo a referência para documento enviado/aprovado. |
| PDF de orçamento | **Funcional no repo** | Geração local, modelos, marca, QR/links de aprovação; PDF autoritativo com hash no servidor continua futuro. |
| Logo e assinatura da empresa portáveis | **Funcional no repo** | Etapa 1 normaliza imagens pequenas para data URI limitada; fotos/anexos grandes ainda precisam de storage privado. |
| Link público do orçamento | **Funcional no repo** | Worker e cliente usam token opaco; `GET` não altera estado. A implantação atual não foi modificada nesta etapa. |
| Aprovação, recusa e motivo pelo cliente | **Funcional no repo** | Fluxo do portal/link implementado. Aceite autenticado contra produção continua no roteiro externo. |
| Assinatura desenhada pelo cliente | **Funcional no repo** | Tela, persistência e testes específicos existem. Não equivale a assinatura qualificada ICP-Brasil nem a parecer jurídico. |
| Recibos vinculados ao orçamento | **Funcional no repo** | Mobile/web e PDF; a Etapa 1 corrigiu a conversão de data civil `DD/MM/AAAA` para ISO válido. |
| Ordem de serviço | **Funcional no repo** | Entidade, telas mobile/desktop/web, checklist e vínculo comercial existem. |
| Aplicativo do técnico | **Parcial** | Há papel de técnico, agenda/OS/checklist e algumas evidências; check-in completo, materiais, apontamento de horas e execução PMOC ainda não formam um fluxo único aceito em campo. |
| Agenda operacional | **Funcional no repo** | Dia/semana, desktop e web; sincronização Google nativa é uma capacidade separada e desabilitada. |
| Despacho por técnico e drag-and-drop | **Parcial** | Atribuição e visões de equipe existem; central completa de despacho com rota/capacidade ainda não. |
| Contrato de prestação de serviço | **Parcial** | Geração/editoração do contrato ligado ao orçamento existe na web e tem teste; biblioteca ampla, ciclo de revisão, assinatura formal e renovação ainda são próximas etapas. |
| Financeiro operacional | **Parcial** | Orçamentos, aprovações, recibos, cobrança e radares cobrem parte do contas a receber; fluxo de caixa, contas a pagar e conciliação completa não estão fechados. |

## Empresa, equipe e segurança

| Capacidade | Estado verificável | Evidência e limite honesto |
| --- | --- | --- |
| Login por e-mail e Google na web | **Funcional no repo** | Supabase Auth e fluxo web presentes. A saúde atual dos provedores externos não foi alterada nem reautenticada. |
| Login Google nativo | **Bloqueado externo** | Exige cliente Android associado ao app assinado e teste no APK final. |
| Multiempresa, membros, convites e papéis | **Funcional no repo** | Migrations, contexto de equipe, mobile e web existem; o estado live das migrations deve ser revalidado antes do release. |
| Login individual de funcionário | **Funcional no repo** | Cada membro usa identidade própria e convite; o administrador define papel/acesso. Por segurança, não lê nem controla a senha do funcionário — usa convite/redefinição oficial. |
| Permissões granulares | **Parcial** | Papéis e gates existem; ainda faltam permissões configuráveis por ação/campo para todos os módulos. |
| RLS e isolamento entre empresas | **Funcional no repo** | Suíte de isolamento/tenant e policies versionadas. Precisa de auditoria live após fechar o baseline do schema. |
| Auditoria administrativa | **Parcial — contrato local reforçado** | Painel/política existem e `adminAccessAudit.js` adiciona trilha local revisionada, idempotente e hash-encadeada. O dispatcher agora exige AAL2 antes de `/admin/api/user`, com regressão que prova negação antes de qualquer consulta service-role. Persistência da auditoria, AAL2 em sessão real e consulta com dados autorizados ainda não foram provados no runtime. |
| Filiais, departamentos e turnos | **Planejado** | Não vender como disponível. |
| Planos e entitlements | **Parcial — contratos locais verdes** | Eventos/trial, reconciliação autoritativa, fixture Controle A/Variante B e journal do funil têm testes locais. Pagamento/cache isolado não concede plano; fonte única, checkout/webhook e lifecycle sandbox continuam bloqueios externos. |
| Assinatura SaaS e portal de cobrança | **Parcial/Bloqueado externo** | Integração e webhooks existem; preços/modos live específicos e aceite financeiro dependem de dashboard e sandbox controlado. |
| Numeração única por empresa | **Parcial — código pronto** | App e web recuperam colisão `23505`, renumeram com auditoria e preservam edição concorrente. O índice único continua em migration `.pendente` até auditar duplicatas no banco live. |

## Web, dados e integrações

| Capacidade | Estado verificável | Evidência e limite honesto |
| --- | --- | --- |
| Painel web responsivo com dados reais | **Funcional no repo** | Dashboard, clientes, orçamentos, OS, recibos, agenda, catálogo, equipamentos, equipe, dados e planos têm rotas próprias. |
| Landing de marketing | **Funcional no repo** | Landing/app web existem; publicação e indexação não foram feitas nesta etapa. |
| Importação/exportação de dados | **Parcial** | Tela web de dados, mapeamento e rotinas de backup existem; portabilidade LGPD de conta inteira ainda não está completa. |
| E-mail transacional | **Persistência e simulador ativos / coorte real bloqueada** | Welcome/outbox estão persistidos no Supabase e o consumer está ativo somente para `delivered@resend.dev`; um canário sintético foi aceito pela API. Supressão/consentimento agora têm política, composição pré-claim, contrato de persistência e draft SQL `LOCAL_ONLY`, mas ainda não integram o claim ativo. Destinatários reais continuam em `hold`. |
| Compartilhamento por WhatsApp | **Funcional no repo** | Orçamento/recibo e suporte usam compartilhamento/deep link. Envio automático para terceiros não é autorizado por padrão. |
| Google Agenda nativa | **Bloqueado e desabilitado** | O scaffold antigo dependia de redirect incompatível com a política OAuth nativa atual. A flag fica fechada até arquitetura suportada, configuração oficial e teste em app assinado. Exportação `.ics`/link Google continua separada. |
| ETA e abertura de rota | **Funcional no repo** | Worker/links de rota existem. Mapa visual embutido e rastreamento em segundo plano continuam parciais. |
| Localização de equipe | **Parcial** | Captura/visão existem sob gates; exige consentimento, política de retenção e aceite de bateria/permissões em dispositivo. |
| Notificações push | **Parcial — contratos + schema draft local** | Política, inbox/journals, registro/revogação de aparelhos e orquestrador cross-channel estão cobertos sem token bruto. O draft `JANELA_3_4_NOTIFICATION_PERSISTENCIA` acrescenta isolamento, RLS/grants, hashes, retenção máxima de 90 dias e purge, mas fica fora de `supabase/migrations`. Persistência aplicada, permissão do SO, FCM/Web Push e entrega em aparelho/navegador real continuam pendentes. |
| Motor geral de automações | **Planejado** | Ainda não há construtor completo evento→condição→ação. |

## IA e inteligência de negócio

| Capacidade | Estado verificável | Evidência e limite honesto |
| --- | --- | --- |
| Voz para criar orçamento | **Funcional no repo** | Fluxo de áudio, segurança de body, quota e testes existem; chamada real depende da saúde do provedor. |
| OLLI Chat | **Funcional no repo** | A Etapa 1 tornou a quota autoritativa no servidor e o uso de crédito explicitamente consentido e idempotente. |
| Diagnóstico HVAC | **Funcional no repo** | Base offline e assistência aterrada; continua sendo apoio, não laudo nem decisão técnica automática. |
| Cadeia gratuita de modelos | **Funcional no repo, variável externamente** | Três modelos `:free` e capacidades estruturadas são verificados contra o catálogo oficial por `npm run check:ai-models`; modelo grátis pode mudar e o preflight deve detectar isso. |
| IA em todos os módulos | **Planejado por etapas** | O princípio está no plano mestre, mas não se declara pronto. Cada copiloto precisa fonte, permissão, explicação, confirmação humana e fallback manual. |
| Aprendizado com orçamentos e preços | **Planejado com contratos de governança** | Política local de dataset e auditoria administrativa definem finalidade, allowlist, pseudonimização, retenção, purge e kill switch. Ainda faltam consentimento/base legal aceitos, pipeline, mínimo de amostra, métricas contra viés e dados autorizados; nenhum dataset real foi criado. |
| Recomendação de preço | **Planejado** | Calculadora determinística vem antes; IA deverá explicar faixa, custo, margem e confiança, nunca impor preço. |

## HVAC/PMOC e ferramentas de campo

| Capacidade | Estado verificável | Evidência e limite honesto |
| --- | --- | --- |
| Inventário de equipamentos | **Funcional no repo** | Ativos, fotos, cliente, dados técnicos, telas mobile/desktop/web e sync. |
| Etiqueta/QR de equipamento | **Funcional no repo** | Token opaco, ficha pública mínima e trilha prevista; impressão e aceite físico ainda merecem teste de campo. |
| PMOC fase 1 — inventário | **Funcional no repo** | Migration, domínio, telas e sync presentes. |
| PMOC fase 2 — plano e recorrência | **Funcional no repo** | Planos, periodicidades e geração idempotente de OS recorrente presentes. |
| PMOC execução em campo | **Parcial** | Usa OS e inventário existentes, mas checklist técnico versionado, leituras, evidências, NC e relatório PMOC completo ainda não estão fechados. |
| Contratos PMOC, SLA e renovação | **Parcial** | Fundação de contratos versionados existe; gestão comercial/assinatura/renovação e rentabilidade ainda não formam o produto completo. |
| Portal PMOC do cliente | **Planejado** | Não está pronto. |
| Qualidade do ar e laudos | **Planejado** | Deve usar limites/versionamento e revisão de responsável habilitado; nunca autodeclarar conformidade. |
| Calculadoras por profissão | **Funcional no repo, em expansão** | A web possui calculadoras HVAC, elétrica, hidráulica, pintura, jardinagem e outras; validação normativa/UX deve ocorrer por calculadora. |

## Qualidade, privacidade e operação

| Capacidade | Estado verificável | Evidência e limite honesto |
| --- | --- | --- |
| Offline-first e sincronização | **Funcional no repo, com dívida** | SQLite + sync e testes existem; conflitos complexos, tombstones e diagnóstico para o usuário ainda podem evoluir. |
| Backup versionado | **Funcional no repo** | Rotinas e testes de partição/equipe existem. Restauração real deve fazer parte do aceite periódico. |
| LGPD | **Parcial** | Exclusão, isolamento e redução de PII em analytics aparecem no código; exportação total, consentimentos, retenção e governança analítica ainda não estão completos. |
| Observabilidade | **Parcial** | Captura de erro/feedback/admin existe; configuração live, alertas e cobertura dos quatro runtimes precisam ser revalidados. |
| Testes automatizados | **Funcional como gate local** | Typecheck, `npm test`, readiness transversal e contratos dedicados são gates ativos. A persistência de supressão acrescenta casos de CAS, replay, isolamento tenant/usuário, ausência de PII e inspeção estática de RLS/grants. Ainda faltam E2E visual e aceites reais de e-mail, cobrança, navegador, Android e produção. |
| Dependências | **Gate local aprovado** | Expo está alinhado, `expo-doctor` passa e os audits do app raiz, painel web, landing e worker retornam zero vulnerabilidades. Overrides foram limitados a versões compatíveis e os builds foram repetidos depois das atualizações. |

## Regra de comunicação

Somente itens **Funcionais no repo** que também passaram pelo respectivo aceite real
podem virar afirmação de produção. Itens **Parciais**, **Bloqueados** ou **Planejados**
devem aparecer na interface e no marketing com linguagem compatível com o estado real.
