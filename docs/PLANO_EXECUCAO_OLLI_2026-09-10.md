# Plano de execução do OLLI Orçamentos — 2026-09-10

Este documento transforma as decisões desta rodada em backlog executável. Ele separa
o que já foi comprovado do que ainda precisa de implementação, homologação ou aceite
humano. “Pronto para usuários” só significa promoção depois dos gates da seção 7.

## 1. Decisões confirmadas nesta rodada

- O PDF do orçamento não exibe QR code. A ação do cliente é um botão/link clicável
  (`Abrir e aprovar` ou `Abrir e pedir ajuste`), com o endereço visível para copiar.
- A página pública continua exigindo confirmação explícita; o parâmetro `acao` apenas
  pré-seleciona a intenção e não altera estado por `GET`.
- “Pago” é estado financeiro, não substitui `aprovado`, `convertido` ou outro estado
  comercial. O app oferece `Marcar pago` com valor, data e forma e mantém o recibo
  como evidência; o recibo PDF pode ser emitido depois.
- A conclusão da OS tem um marco próprio (`concluido_em`). Editar uma OS já concluída
  não a move de mês; reabrir limpa o marco e concluir novamente cria outro.
- Mudanças de banco deste ciclo são staging-first. Produção permanece bloqueada até
  os gates humanos e de release.

## 2. Produto que será entregue

### 2.1 Central de Documentos

Uma entrada única em Conta/Ferramentas, sem remover os caminhos atuais:

1. biblioteca por cliente, orçamento, OS, equipamento e plano PMOC;
2. modelos de contrato, garantia, conclusão/aceite, recibo, laudo/relatório,
   checklist fotográfico, PMOC e certificado de dedetização;
3. criação por dados de origem, edição em rascunho, revisão/versionamento e
   congelamento do PDF quando enviado ou assinado;
4. estados `rascunho`, `pronto`, `enviado`, `assinado`, `arquivado`, com trilha de
   quem criou, origem e data;
5. assinatura desenhada identificada honestamente como aceite simples. Assinatura
   avançada gov.br/ITI fica como integração opcional, homologada e separada.

Modelo de dados futuro: documento + versões imutáveis + referências de origem +
artefato PDF + eventos/auditoria. Nenhum PDF enviado deve ser sobrescrito.

### 2.2 Ajuda oficial e rotinas do prestador

O hub de ajuda deve mostrar fonte, data da última conferência e validade do conteúdo.
Primeiras rotas: NFS-e, gov.br, assinatura eletrônica, impostos, Sebrae, cursos,
PMOC e orientações por ofício. A primeira entrega é guia/deep link seguro; emissão
fiscal automática só entra depois de credenciamento e homologação por município.

PMOC exige responsável técnico e revisão humana. O texto legal da Lei 13.589/2018
continua sendo referência, mas normas sanitárias mudam: o cadastro deve ser
versionado e não pode congelar a antiga RE 9/2003, revogada pela RDC 886/2024.

Fontes oficiais usadas no desenho:

- [NFS-e Padrão Nacional](https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica)
- [App emissor NFS-e](https://www.gov.br/nfse/pt-br/municipios/produtos-disponiveis/app-emissor-de-nfs-e)
- [Documentação técnica NFS-e](https://www.gov.br/nfse/pt-br/nfs-e-via/documentacao-tecnica)
- [Lei 13.589/2018 — PMOC](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm)
- [Assinatura eletrônica gov.br](https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica)

### 2.3 IA com agência limitada

Três modos visíveis no botão contextual:

- **Consultar:** responde usando dados autorizados e fontes citadas, sem escrever;
- **Preparar:** importa PDF/CSV/foto, propõe rascunho e mostra diff;
- **Executar:** só aplica uma ação allowlisted após confirmação do usuário.

Pesquisa de preços deve guardar cidade/UF, fonte, data, faixa e confiança. Cadastro em
lote vira prévia editável (por exemplo, dez serviços de ar-condicionado), nunca
inserção automática. Uploads passam por isolamento de prompt injection, limites de
páginas/tamanho/custo e retenção definida. Exclusão em massa, emissão fiscal,
pagamento, mudança de permissões e alteração de identidade exigem confirmação forte
ou ficam fora da IA.

### 2.4 Onboarding, planos e landing

- empresa, telefone e dados mínimos são obrigatórios antes de gerar documento;
- onboarding segmentado por ofício, com progresso, ajuda guiada e possibilidade de
  retomar;
- landing específica por vertical sem limitar o produto a cinco ofícios;
- gratuito mantém núcleo útil, mas com limite explícito de envios/IA;
- trial sem cartão só pode ser promovido depois de instrumentar elegibilidade,
  consentimento, encerramento e reconciliação; a garantia legal de arrependimento
  continua explícita.

## 3. Estado atual comprovado

- Documentos existentes: contrato, termos, recibo, certificado, modelos e PMOC;
  os caminhos atuais continuam funcionando. A Central já projeta esses registros em
  uma biblioteca pesquisável por origem/estado, e o registro persistente com versões
  append-only já existe localmente e no staging; PDFs nativos agora tentam Storage
  privado com chave/hash e mantêm fallback local/web explícito.
- Revisão de orçamento: rascunho é editável; proposta enviada/aceita gera revisão.
- Pagamento: `registrarPagamento` agora tem caminho de UI no detalhe mobile; o
  financeiro já deriva `aguardando_pagamento`, `pago` e `recibo_emitido`.
- OS: `concluido_em` sincronizado no app, web, SQLite e Supabase staging; KPIs usam
  o marco, não `atualizado_em`.
- Segurança IA: allowlist, diff, confirmação, auditoria, tenant/RBAC e limites já
  existentes; a prévia de importação em lote agora valida fonte HTTPS, data,
  confiança, duplicidade e papel do executor, sem escrever no catálogo. A Central
  de Dados acrescenta prévia determinística para CSV/XLSX/JSON e compensação
  reversível por linha; ingestão de PDF/foto continua fora do caminho crítico até
  existir um parser isolado e homologado.
- Staging: Worker `52ceba62-0bf1-4797-a272-a74907275ae4`, deployment
  `7b633269-83b0-47ee-9343-8ac855d7f609`, smoke sem side effects e rota de
  prévia IA publicada sem domínio de produção.
- Integridade financeira staging: CHECKs de status/valor validados e trigger
  transacional de saldo em `recibos`; a UI nativa/web bloqueia excedente e o
  estado financeiro sobrevive a mudanças comerciais.
- Artefatos: `arquivo_chave` estável, hash SHA-256 no PDF nativo, upload privado
  best-effort com URL assinada regenerável e fallback local; Central de
  Documentos também está disponível no painel web.
- IA mobile: modo contextual de preparação com diff, confirmação, cancelamento
  e reversão pelos endpoints allowlisted já existentes no Worker.
- IA de importação: Worker expõe `POST /ia/importacao/preview`, autenticado e
  limitado pela mesma cota/rate-limit, que aceita texto + fontes HTTPS, retorna
  lote estruturado com preço/confiança e marca `requiresReview=true`; não há
  escrita, cobrança, busca externa ou alteração automática. O commit continua
  sob confirmação humana na Central de Dados.
- Ledger financeiro: tabela `pagamentos` append-only no staging, idempotência por
  tenant/chave, saldo serializado por orçamento, comprovante privado e estorno
  auditável; a trigger também fecha INSERT direto já estornado e registra
  `ledgerStatus` no recibo sem esconder pendências. A migration
  `20260911124652_payments_ledger_receipt_link` adiciona o vínculo controlado
  NULL→recibo, idempotente e limitado ao mesmo tenant, sem editar o evento.
- Outbox financeiro: recibos pendentes e eventos confirmados ainda sem vínculo
  são reprocessados no login/retorno ao primeiro plano; o estado
  `ledgerReciboVinculado` impede duplicação e mantém a tentativa auditável.
- Importação reversível: a Central de Dados registra o snapshot anterior de cada
  linha, aplica em ordem determinística e, em erro, compensa em ordem reversa
  usando os valores anteriores ou a lixeira (soft-delete). Falha de compensação
  fica explícita para não declarar sucesso parcial como concluído.
- QA web: o harness Playwright registra HTTP final, rota, console/page errors,
  DOMContentLoaded/load, recursos e bytes transferidos em
  `qa-artifacts/qa-web-results.json`; sem credencial de demonstração, o caso
  autenticado para no guard e é reportado como `authRequired=true`.
- Arquivos privados: a Central web gera URL assinada de curta duração para
  `arquivo_chave`, validando bucket/tenant/categoria e sem transformar a chave em
  link público; o editor limita o conteúdo e mostra contador.
- Expo: o conjunto SDK 57 foi alinhado pelo instalador oficial (`57.0.22` e
  patches compatíveis); `expo-doctor` passa em 20/20 e o contrato de permissões
  de notificação usa `granted`.
- PMOC/ativos: DELETE de cabeçalhos agora exige dono/admin/gestor; tokens e
  versões históricas não têm DELETE para `authenticated`. A policy foi exercitada
  com técnico sintético em staging e rollback transacional.
- OAuth futuro: o verifier PKCE do scaffold de Google Agenda usa aleatoriedade
  criptográfica; a integração nativa continua desligada até redirect HTTPS e
  build assinado homologados.
- Performance de dados: a migration `20260911141612_remove_duplicate_ia_quota_indexes`
  removeu índices UNIQUE legados duplicados das cotas IA sem tocar nas constraints
  primárias. Os avisos restantes de policies permissivas múltiplas em tabelas
  legadas exigem revisão de contrato antes de qualquer consolidação.

## 4. Próximas fatias, em ordem

1. Central de Documentos: editor de rascunho visual e RPC transacional já estão
   entregues; permanece a expansão de abertura/paginação de tipos de origem, sem
   mudar o contrato de versões congeladas.
2. Pagamentos: ledger/RPC/hash/comprovante, vínculo controlado, retry mobile e
   estorno já estão no staging; a visualização administrativa de estorno no painel
   web fica como melhoria posterior, sem bloquear o fluxo mobile homologado.
3. Ajuda oficial: registro de fonte/versão, NFS-e e PMOC; links/deep links primeiro.
4. IA de documentos: CSV/XLSX/JSON e o endpoint de texto já possuem
   preview/diff/rollback seguro; PDF/foto continuam bloqueados até o job isolado,
   parser aprovado e validação de saída estruturada (não entram no caminho crítico).
5. Performance: QA web mede carregamento frio nos dois viewports e o smoke ADB
   mede o primeiro frame do SM-G780F; ainda falta separar um perfil release sem
   Metro para decidir lazy loading, virtualização e thumbnails.
6. Landing/onboarding: páginas por vertical e copy de teste grátis baseada em dados,
   sem prometer recurso ainda não liberado.
7. Auditoria final independente: RLS/tenant, upload, IA, pagamentos, deploy,
   observabilidade e rollback.

## 5. Pesquisa de ferramentas open source

- Docling é candidato para ingestão isolada de PDF/DOCX/PPTX/XLSX/imagem/áudio e
  saída estruturada; deve rodar como job com limites, não dentro da UI.
- Gotenberg é candidato para conversão HTML/Office→PDF quando houver runtime
  Docker/Worker compatível; o ADR atual mantém o bloqueio enquanto o host não existir.
- NFS-e nacional não deve ser “raspada”: a documentação oficial descreve credenciais,
  credenciamento e layouts/XML por município.
- OWASP LLM Top 10 orienta prompt injection, output inseguro e excessive agency;
  function calling/structured output são mecanismos de validação, não autorização.

## 6. Como medir aceite

- zero perda de dados ao editar OS/quote em dois aparelhos;
- 100% dos documentos enviados preservam versão e origem;
- pagamento parcial não informa “pago” antes do saldo zerar;
- IA sem confirmação não altera banco; ação não allowlisted falha fechado;
- uma importação interrompida restaura as linhas já tocadas ou as marca na lixeira,
  e falhas de rollback ficam visíveis;
- RLS/tenant isolam conta A de B;
- boot e navegação do aparelho de referência sem fatal, SQLite error ou tela vazia;
- smoke staging com health, CORS, método, auth shell e `sideEffects: none`.
- QA web gera métricas de carregamento nos viewports desktop/mobile e não confunde
  guard de login com fluxo autenticado.
- A última rodada registrou HTTP 200, zero erros de console/page e orçamento de
  carregamento aprovado nos dois viewports; o fluxo autenticado segue pendente
  apenas por ausência de credencial demo nesta sessão.

## 7. Gates para liberar usuários reais

1. **Código:** typecheck, suíte completa, build web, APK e revisão de diff.
2. **Dados:** migrations staging aplicadas, advisors revisados, backup e rollback.
3. **Segurança:** RLS, tenant, IA, upload, rate/cost limits e secrets verificados.
4. **Operação:** Worker/Pages staging, smoke, logs e alerta sem efeitos colaterais.
5. **Produto:** roteiro de onboarding, trial, copy, suporte e documentação revisados.
6. **Humano:** aceite explícito para produção, OAuth/segredos, cobrança e publicação.

Até o sexto gate, o sistema pode ser testado no staging e no aparelho demo, mas não
é honesto declarar que está oficialmente liberado para toda a base.
