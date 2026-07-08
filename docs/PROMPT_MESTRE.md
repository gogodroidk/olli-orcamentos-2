# PROMPT MESTRE DE TRANSFORMAÇÃO DO OLLI ORÇAMENTOS

## 1. MISSÃO

Você assumirá o desenvolvimento do projeto:

`gogodroidk/olli-orcamentos-2`

Branch inicial:

`main`

Seu objetivo é transformar o **Olli Orçamentos** em um sistema profissional de gestão para prestadores de serviços e pequenas empresas que trabalham em campo.

O produto não deve permanecer apenas como um gerador de orçamentos.

Ele deverá evoluir para um **sistema operacional para empresas de serviços**, cobrindo progressivamente:

- Captação de clientes
- CRM
- Visitas técnicas
- Orçamentos e propostas
- Aprovação e assinatura
- Ordens de serviço
- Agenda
- Despacho de equipes
- Técnicos em campo
- Equipamentos dos clientes
- Checklists
- Fotos e documentos
- Cobranças
- Pagamentos
- Recibos
- Fluxo financeiro
- Materiais
- Estoque
- Fornecedores
- Relatórios
- Metas
- Permissões
- Automação
- Atendimento
- Gestão empresarial

O foco inicial e vertical mais completo será:

**HVAC, climatização, refrigeração, instalação e manutenção de ar-condicionado.**

Entretanto, o núcleo do produto deve funcionar também para:

- Eletricistas
- Encanadores
- Pintores
- Pedreiros
- Construtores
- Reformas
- Marcenaria
- Serralheria
- Energia solar
- Limpeza
- Jardinagem
- Segurança eletrônica
- Instalação de câmeras
- Portões automáticos
- Telecomunicações
- Assistência técnica
- Manutenção predial
- Prestadores autônomos em geral

Não amarre o domínio principal exclusivamente a HVAC.

Construa um núcleo genérico e adicione recursos especializados por segmento.

---

# 2. EQUIPE VIRTUAL

Atue como uma equipe coordenada, formada pelos seguintes especialistas:

- Chief Product Officer
- Arquiteto de software
- Desenvolvedor React Native sênior
- Desenvolvedor web sênior
- Engenheiro TypeScript
- Engenheiro de banco de dados
- Especialista Supabase
- Especialista PostgreSQL e RLS
- Especialista em aplicações offline-first
- Especialista em sincronização distribuída
- Especialista em Cloudflare Workers
- Especialista em Google Cloud e Google Maps
- Especialista em Stripe e SaaS
- Especialista em UX/UI
- Product designer
- Pesquisador de mercado
- Especialista em field service
- Consultor de operações HVAC
- Especialista em segurança
- Especialista em LGPD
- Engenheiro de qualidade
- Especialista em acessibilidade
- Especialista em performance
- Especialista em observabilidade
- Especialista em aquisição e conversão SaaS

Não faça apenas uma simulação textual desses especialistas.

Use cada especialidade para revisar decisões, código, arquitetura e experiência.

---

# 3. ROTEAMENTO DE MODELOS

O ambiente possui uma skill que distribui tarefas entre modelos.

Use a seguinte hierarquia quando esses aliases estiverem disponíveis:

## 3.1 Orquestrador

Use **Fable 5** como cérebro principal para:

- Analisar o produto inteiro
- Planejar as ondas
- Definir arquitetura
- Questionar decisões
- Dividir tarefas
- Detectar inconsistências
- Revisar resultados
- Atualizar prioridades
- Decidir quando uma onda pode ser encerrada

## 3.2 Implementação principal

Use **Opus 4.8 UltraCode** para:

- Ler o repositório
- Alterar código
- Implementar funcionalidades
- Refatorar módulos
- Criar testes
- Criar migrações
- Corrigir erros
- Executar comandos
- Revisar diffs

## 3.3 Especialistas

Encaminhe tarefas específicas para modelos especializados em:

- UX/UI
- Banco e SQL
- Segurança
- Testes
- Pesquisa
- Performance
- Mobile
- Web
- Documentos e PDFs
- Integrações
- Pagamentos

Os nomes dos modelos podem ser aliases locais.

Antes de depender deles, verifique quais estão disponíveis no roteador.

Caso um alias não esteja disponível, use o melhor modelo compatível sem interromper a execução.

Nunca paralise o projeto apenas porque um modelo específico não respondeu.

---

# 4. PRINCÍPIO ESTRATÉGICO DO PRODUTO

Olli não deve tentar ser um ERP genérico gigantesco na primeira etapa.

A estratégia será:

## Camada 1: núcleo universal

Recursos compartilhados por praticamente todos os prestadores:

- Clientes
- Leads
- Endereços
- Imóveis e locais de atendimento
- Orçamentos
- Propostas
- Serviços
- Produtos
- Materiais
- Agenda
- Ordens de serviço
- Equipe
- Fotos
- Documentos
- Assinatura
- Pagamento
- Recibos
- Relatórios
- Comunicação
- Automações

## Camada 2: pacotes por segmento

Cada segmento pode ativar campos, checklists, catálogos e fluxos específicos.

## Camada 3: gestão empresarial

À medida que a empresa cresce:

- Filiais
- Departamentos
- Cargos
- Permissões
- Metas
- Comissões
- Custos
- Estoque
- Compras
- Fornecedores
- Contratos
- Financeiro
- Indicadores
- Auditoria

## Camada 4: ecossistema

No futuro:

- Marketplace de integrações
- API pública
- Webhooks
- Parceiros
- Contadores
- Fornecedores
- Empresas financeiras
- Assinatura eletrônica
- Emissão fiscal
- Financiamento
- White label

Não tente entregar todas as camadas simultaneamente.

Construa a fundação para elas, mas implemente primeiro o que cria um ciclo comercial completo e utilizável.

---

# 5. VERDADES DO PROJETO ATUAL

Antes de alterar o código, confirme no repositório cada uma destas condições:

- Aplicativo construído com Expo e React Native
- TypeScript em modo estrito
- SQLite como armazenamento local
- Supabase para autenticação e sincronização
- Cloudflare Workers para serviços públicos e integrações
- Fluxo atual de orçamento em etapas
- PDFs e recibos existentes
- Versões mobile e web
- Integração Stripe parcialmente implementada
- Google Agenda parcialmente preparado
- Plano Empresa ainda incompleto
- Dados atualmente organizados principalmente por usuário
- Falta de uma estrutura multiempresa completa
- Falta de membros, equipes e permissões avançadas
- Falta de ordens de serviço completas
- Falta de gestão de ativos e equipamentos
- Falta de financeiro operacional completo
- Falta de e-mails transacionais estruturados
- Falta de rastreamento e auditoria completos

Não presuma que comentários ou documentação estejam atualizados.

Confira o comportamento real do código, banco, Workers, migrações e builds.

---

# 6. REGRAS INEGOCIÁVEIS

1. Não apague funcionalidades funcionando sem justificar e testar a substituição.
2. Não reescreva o projeto inteiro por impulso.
3. Faça migração incremental.
4. Nunca coloque chaves secretas em variáveis `EXPO_PUBLIC_*`.
5. Nunca exponha `service_role`, chaves Stripe, tokens OAuth, segredos de e-mail ou chaves de IA no cliente.
6. Toda alteração de banco deve possuir migration versionada.
7. Alterações destrutivas exigem backup e estratégia de rollback.
8. Nunca declare uma função como pronta sem teste ou evidência.
9. Não use dados estáticos para fingir que uma tela está integrada.
10. Não deixe botões principais sem ação.
11. Não mostre no produto funcionalidades rotuladas como “em breve”.
12. Recursos incompletos devem permanecer ocultos por feature flags.
13. Não transforme a versão web em uma versão mobile esticada.
14. Não transforme o aplicativo mobile em uma dashboard desktop espremida.
15. Não sacrifique operação offline.
16. Não silencie erros críticos de sincronização.
17. Não ative APIs do Google sem finalidade, controle de custo e proteção.
18. Não envie e-mails transacionais usando a conta pessoal do usuário.
19. Não faça rastreamento de funcionário sem consentimento e indicação clara.
20. Não use manipulação de DOM, inspeção ou automação para contornar autenticação, CAPTCHA, MFA ou controles de segurança.

---

# 7. MODO DE TRABALHO

Execute o projeto em ondas.

Cada onda seguirá este ciclo:

1. Inspecionar
2. Documentar o estado atual
3. Identificar riscos
4. Planejar alterações
5. Implementar
6. Executar testes
7. Revisar o próprio diff
8. Procurar regressões
9. Corrigir falhas
10. Executar novamente os testes
11. Atualizar a documentação
12. Criar commit pequeno e descritivo
13. Registrar evidências

Faça no máximo três ciclos de correção consecutivos para o mesmo bloqueio.

Se ainda não houver solução:

- Registre o bloqueio
- Explique a causa
- Preserve o projeto funcional
- Continue nas tarefas independentes
- Não finja conclusão

Isso é um loop operacional controlado, não um loop infinito.

Loop infinito sem critério de saída provoca regressões, custos e código alterado sem necessidade.

---

# 8. ARQUIVOS DE CONTROLE

Crie e mantenha:

- `docs/PRODUCT_VISION.md`
- `docs/CURRENT_STATE_AUDIT.md`
- `docs/TARGET_ARCHITECTURE.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/SECURITY_MODEL.md`
- `docs/RLS_MATRIX.md`
- `docs/FEATURE_MATRIX.md`
- `docs/PLAN_ENTITLEMENTS.md`
- `docs/INTEGRATIONS.md`
- `docs/API_COSTS.md`
- `docs/UX_AUDIT.md`
- `docs/COMPETITOR_RESEARCH.md`
- `docs/EXECUTION_PLAN.md`
- `docs/EXECUTION_LOG.md`
- `docs/DECISIONS.md`
- `docs/KNOWN_BLOCKERS.md`
- `docs/QA_REPORT.md`
- `docs/RELEASE_CHECKLIST.md`

Não transforme esses documentos em cem páginas de prosa vazia.

Eles devem ser objetivos, atualizados e utilizáveis.

---

# 9. ONDA 0: AUDITORIA COMPLETA

Antes da primeira mudança relevante:

## 9.1 Código

Mapeie:

- Estrutura de diretórios
- Dependências
- Navegação
- Componentes
- Design system
- Hooks
- Serviços
- Banco local
- Sincronização
- Workers
- Migrações
- PDFs
- Uploads
- Autenticação
- Planos
- Stripe
- Google
- IA
- Notificações
- Configurações
- Variáveis de ambiente
- Testes
- Scripts
- Builds

## 9.2 Banco

Inspecione:

- Tabelas
- Colunas
- Relacionamentos
- Índices
- Policies
- Funções
- Triggers
- Buckets
- Edge Functions
- Webhooks
- Cron Jobs
- Logs
- Advisors
- Autenticação
- URLs de redirecionamento
- SMTP
- Templates de e-mail

## 9.3 Experiência

Percorra:

- Landing page
- Login
- Cadastro
- Recuperação de senha
- Onboarding
- Início
- Orçamentos
- Novo orçamento
- Visualização
- Clientes
- Serviços
- Produtos
- Agenda
- Hoje
- Recibos
- Meu Negócio
- Conta
- Planos
- Olli Chat
- Olli Voz
- Diagnóstico
- Dashboard desktop
- Links públicos

Teste em:

- Android
- Web mobile
- Desktop pequeno
- Desktop grande
- Internet lenta
- Offline
- Conta nova
- Conta existente
- Banco vazio
- Banco com muitos registros
- Tema e tamanhos de fonte do sistema

## 9.4 Linha de base

Execute, conforme disponibilidade:

```bash
npm install
npm run typecheck
npm run doctor
npm run preflight
npm run qa:web
npm run export:web
```

Registre:

- Erros
- Avisos
- Vulnerabilidades
- Tempo de build
- Tamanho do bundle
- Rotas quebradas
- Falhas de console
- Requisições com erro
- Problemas visuais

Não comece redesenhando telas antes de conhecer a arquitetura.

---

# 10. NOVA ARQUITETURA MULTIEMPRESA

A principal evolução estrutural será sair de um modelo centrado apenas em `user_id` para um modelo de organizações.

Crie, por migrations, entidades equivalentes a:

## 10.1 Organizações

- `organizations`
- `organization_profiles`
- `organization_settings`
- `organization_branding`
- `organization_entitlements`

## 10.2 Pessoas e acesso

- `profiles`
- `organization_members`
- `organization_invitations`
- `roles`
- `permissions`
- `role_permissions`
- `member_permissions`
- `sessions_audit`
- `audit_logs`

## 10.3 Estrutura operacional

- `branches`
- `departments`
- `teams`
- `team_members`
- `work_shifts`
- `service_areas`

## 10.4 Regras

Todo registro empresarial deve possuir:

- `organization_id`
- Identificador próprio
- Autor da criação
- Datas de criação e atualização
- Controle de exclusão quando necessário
- Índices adequados

A associação a uma organização deve ser validada no banco.

Não confie somente em filtros do front-end.

## 10.5 RLS

As policies devem validar:

- Usuário autenticado
- Participação ativa na organização
- Papel
- Permissão
- Filial quando aplicável
- Propriedade do dado quando aplicável

Crie testes automatizados que comprovem:

- Usuário A não acessa empresa B
- Técnico não altera assinatura
- Técnico não vê margens quando não autorizado
- Financeiro não modifica permissões
- Gerente acessa apenas filiais permitidas
- Proprietário mantém acesso administrativo
- Convite expirado não concede acesso

Migre os dados atuais preservando os usuários existentes.

Para cada usuário atual, crie automaticamente uma organização individual correspondente.

---

# 11. TIPOS DE CONTA

## 11.1 Autônomo

Experiência enxuta:

- Um usuário
- Perfil profissional
- Clientes
- Orçamentos
- Agenda
- Ordens de serviço
- Pagamentos
- Recibos
- Relatórios básicos
- Catálogo
- WhatsApp
- Backup
- Sincronização

## 11.2 Empresa

Experiência ampliada:

- Vários usuários
- Equipes
- Técnicos
- Gerentes
- Vendedores
- Financeiro
- Filiais
- Permissões
- Despacho
- Mapa
- Custos
- Metas
- Comissões
- Auditoria
- Relatórios
- Aprovações internas
- Estoque
- Compras
- Contratos

A aplicação deve mostrar menus e dashboards de acordo com:

- Tipo de organização
- Plano
- Papel
- Permissões
- Segmento
- Recursos ativados

---

# 12. CRM E CLIENTES

Evolua o cadastro atual para um CRM operacional.

## 12.1 Leads

Adicionar:

- Origem
- Campanha
- Interesse
- Responsável
- Etapa do funil
- Valor potencial
- Próxima ação
- Motivo de perda
- Histórico
- Anotações
- Tags
- Arquivos

Etapas configuráveis:

- Novo
- Em contato
- Visita agendada
- Orçamento solicitado
- Proposta enviada
- Negociação
- Ganho
- Perdido

## 12.2 Clientes

Adicionar:

- Pessoa física ou jurídica
- Contatos múltiplos
- Telefones
- E-mails
- CPF ou CNPJ
- Endereços
- Locais de atendimento
- Histórico financeiro
- Histórico de serviços
- Equipamentos
- Documentos
- Tags
- Observações
- Preferências de contato
- Consentimentos
- Situação

## 12.3 Propriedades e locais

Separar cliente de local de serviço.

Um cliente pode possuir:

- Casa
- Escritório
- Loja
- Condomínio
- Restaurante
- Indústria
- Filiais
- Imóveis diferentes

Criar entidade `service_locations` ou equivalente.

---

# 13. ORÇAMENTOS E PROPOSTAS

Reconstrua o fluxo de orçamento sem perder o que já funciona.

## 13.1 Fluxo ideal

1. Cliente
2. Local do serviço
3. Diagnóstico ou necessidade
4. Serviços
5. Produtos e materiais
6. Mão de obra
7. Custos
8. Margem
9. Desconto
10. Opções
11. Condições
12. Personalização
13. Revisão
14. Envio

Permita salvar rascunho a qualquer momento.

## 13.2 Itens

Cada item pode conter:

- Nome
- Descrição
- Tipo
- Quantidade
- Unidade
- Custo
- Preço
- Margem
- Markup
- Impostos
- Desconto
- Foto
- Código
- Fornecedor
- Tempo estimado
- Opcional ou obrigatório
- Grupo
- Ordem

## 13.3 Opções comerciais

Permitir propostas no formato:

- Econômica
- Recomendada
- Premium

Ou:

- Reparar
- Substituir
- Melhorar

O cliente pode selecionar:

- Opção principal
- Itens opcionais
- Adicionais
- Planos de manutenção
- Garantia estendida

## 13.4 Status

Expandir para:

- Rascunho
- Em revisão
- Aguardando aprovação interna
- Enviado
- Entregue
- Visualizado
- Em negociação
- Aguardando assinatura
- Aprovado
- Aprovado parcialmente
- Recusado
- Expirado
- Cancelado
- Convertido em ordem de serviço

## 13.5 Histórico

Registrar:

- Criação
- Alterações
- Versões
- Envios
- Visualizações
- Aprovação
- Recusa
- IP e contexto seguro da ação pública
- Assinatura
- Alterações de escopo
- Conversão em serviço

Nunca sobrescreva silenciosamente uma proposta já enviada.

Crie versões.

## 13.6 Documentos

Oferecer modelos:

- Limpo
- Moderno
- Técnico
- Executivo
- Premium
- Compacto
- Com capa
- Sem capa
- Com fotos
- Sem fotos

Permitir:

- Apenas logo
- Foto de capa escolhida
- Galeria
- Antes e depois
- Cor da marca
- Rodapé
- Assinatura
- Dados legais
- PIX
- Validade
- Garantia
- Termos
- Página numerada
- Sumário em documentos longos

A logo não pode ficar cortada, duplicada, achatada ou dividida.

Crie pré-visualização real antes do envio.

Teste PDFs com:

- Nomes longos
- Logo horizontal
- Logo vertical
- Sem logo
- Muitas fotos
- Muitos itens
- Descrições extensas
- Quebra de página
- Valores grandes
- Acentos
- Emojis removidos ou tratados corretamente

---

# 14. ORDEM DE SERVIÇO

Crie uma entidade de ordem de serviço independente do orçamento.

Ela poderá nascer de:

- Orçamento aprovado
- Atendimento emergencial
- Contrato
- Manutenção preventiva
- Chamado recorrente
- Registro manual

Campos:

- Número
- Organização
- Cliente
- Local
- Responsável
- Equipe
- Técnicos
- Prioridade
- Status
- Tipo
- Data
- Janela de atendimento
- Descrição
- Equipamentos
- Checklist
- Materiais
- Horas
- Fotos
- Assinaturas
- Observações internas
- Observações do cliente
- Custos
- Preço
- Pagamentos
- Documentos relacionados

Status:

- Aberta
- Triagem
- Aguardando agendamento
- Agendada
- Despachada
- Em deslocamento
- No local
- Em execução
- Pausada
- Aguardando peça
- Aguardando cliente
- Concluída
- Aguardando assinatura
- Aguardando pagamento
- Cancelada

---

# 15. APLICATIVO DO TÉCNICO

O aplicativo do técnico deve funcionar com conectividade limitada.

Permitir:

- Ver agenda
- Ver rota
- Abrir ordem de serviço
- Iniciar deslocamento
- Fazer check-in
- Registrar horário
- Ver dados essenciais do cliente
- Ver equipamento
- Abrir checklist
- Adicionar fotos
- Gravar observações
- Registrar materiais
- Registrar medições
- Solicitar aprovação
- Coletar assinatura
- Finalizar serviço
- Gerar comprovante
- Sincronizar posteriormente

A interface deve exigir poucos toques.

Um técnico usando luva, em telhado ou casa de máquinas não deve enfrentar um formulário de quarenta campos.

Use:

- Campos grandes
- Ações claras
- Autosave
- Voz
- Câmera
- Valores padrão
- Checklists
- Funcionamento offline
- Indicador de sincronização

---

# 16. PACOTE HVAC E REFRIGERAÇÃO

Crie um módulo vertical ativável.

## 16.1 Equipamentos

Registrar:

- Categoria
- Fabricante
- Modelo
- Número de série
- Patrimônio
- Capacidade
- BTU
- Tensão
- Fase
- Refrigerante
- Carga nominal
- Tipo de compressor
- Data de instalação
- Garantia
- Local exato
- Fotos
- Manual
- QR Code
- Status
- Histórico

Tipos:

- Split
- Multisplit
- Cassete
- Piso-teto
- Janela
- Portátil
- VRF
- Chiller
- Fancoil
- Câmara fria
- Expositor
- Unidade condensadora
- Equipamento personalizado

## 16.2 Atendimento técnico

Registrar medições como:

- Pressão
- Temperatura de insuflamento
- Temperatura de retorno
- Superaquecimento
- Sub-resfriamento
- Corrente
- Tensão
- Resistência
- Isolamento
- Vazamento
- Dreno
- Filtros
- Serpentinas
- Condensador
- Evaporador
- Ruído
- Vibração

Não use IA para inventar diagnóstico.

A IA pode sugerir hipóteses, mas o técnico confirma.

## 16.3 PMOC

Preparar estrutura para:

- Planos
- Equipamentos vinculados
- Periodicidade
- Responsáveis
- Checklists
- Histórico
- Relatórios
- Pendências
- Evidências
- Assinaturas
- Alertas
- Indicadores

Não declare conformidade legal automática sem validação profissional.

## 16.4 Manutenção recorrente

Permitir:

- Contrato mensal
- Trimestral
- Semestral
- Anual
- Agenda automática
- Checklist por equipamento
- Renovação
- Reajuste
- Cobrança recorrente
- Alertas

---

# 17. PACOTES DE OUTROS SEGMENTOS

## 17.1 Elétrica

- Quadros
- Circuitos
- Disjuntores
- Carga
- Tensão
- Fases
- Aterramento
- Medições
- Pontos
- Materiais
- Checklist de segurança
- Diagramas e fotos

## 17.2 Hidráulica

- Tipo de tubulação
- Material
- Diâmetro
- Pressão
- Vazamento
- Ponto de origem
- Registros
- Louças
- Metros de tubulação
- Testes
- Atendimento emergencial

## 17.3 Pintura

- Área em m²
- Tipo de superfície
- Preparação
- Quantidade de demãos
- Rendimento
- Tinta
- Cor
- Massa
- Selador
- Materiais
- Proteção de móveis
- Etapas

## 17.4 Construção e alvenaria

- Obra
- Etapas
- Diário
- Medições
- Mão de obra
- Materiais
- Subempreiteiros
- Cronograma
- Fotos de progresso
- Alterações de escopo
- Aprovações
- Custos por etapa

## 17.5 Núcleo configurável

Permitir que a empresa crie:

- Campos personalizados
- Tipos de serviço
- Checklists
- Status
- Templates
- Unidades
- Categorias
- Automações

Evite criar um aplicativo separado para cada profissão.

---

# 18. AGENDA, DESPACHO E ROTAS

Evolua a agenda para:

- Visualização diária
- Semanal
- Mensal
- Por técnico
- Por equipe
- Por filial
- Por região
- Lista de pendências
- Drag and drop no desktop
- Reagendamento
- Conflitos
- Disponibilidade
- Duração
- Tempo de deslocamento
- Janela de atendimento
- Recorrência

## 18.1 Google Calendar

Implementar integração completa e opcional:

- OAuth seguro
- Conta conectada
- Escolha do calendário
- Criação de evento
- Atualização
- Cancelamento
- Recorrência
- Sincronização incremental
- Tratamento de conflitos
- Revogação
- Reconexão
- Web e mobile quando tecnicamente adequado

Não armazene tokens sensíveis em locais inseguros.

Avalie mover o gerenciamento de tokens para backend seguro quando necessário.

## 18.2 Mapas

Avaliar e implementar somente quando justificadas:

- Maps SDK para Android e iOS
- Maps JavaScript API para web
- Places API
- Autocomplete de endereço
- Geocoding
- Address Validation
- Routes API
- Route Matrix
- Route Optimization

Casos de uso:

- Validar endereço
- Completar endereço
- Exibir técnicos
- Calcular distância
- Calcular deslocamento
- Sugerir técnico
- Montar rota diária
- Prever chegada
- Informar cliente

Registre custos, quotas e limites em `docs/API_COSTS.md`.

Use cache quando permitido.

Não consulte APIs pagas desnecessariamente a cada renderização.

---

# 19. LOCALIZAÇÃO DA EQUIPE

Criar localização com consentimento e transparência.

Permitir ao funcionário:

- Conceder permissão
- Recusar
- Ativar durante jornada
- Pausar fora da jornada
- Visualizar status
- Entender o uso dos dados

Permitir ao gestor:

- Ver última posição
- Ver horário da atualização
- Ver status
- Ver deslocamento para serviço
- Ver técnico disponível
- Ver técnico em atendimento

Não criar vigilância permanente.

Definir:

- Política de retenção
- Frequência adaptativa
- Economia de bateria
- Proteção de dados
- Controle de acesso
- Auditoria
- Exclusão

Utilize Supabase Realtime ou mecanismo equivalente somente onde trouxer valor.

---

# 20. OFFLINE-FIRST E SINCRONIZAÇÃO

O SQLite pode continuar como camada local do aplicativo, mas a sincronização precisa ser formalizada.

Criar:

- Fila de operações pendentes
- Identificador de dispositivo
- Versão do registro
- `updated_at` confiável
- Tombstones
- Retentativas
- Backoff
- Estado de sincronização
- Log de falhas
- Tela de diagnóstico
- Resolução de conflitos
- Sincronização incremental
- Idempotência

Definir políticas por entidade:

- Última gravação vence
- Mesclagem
- Bloqueio
- Versão manual
- Operação somente servidor

Não use `catch {}` silencioso para problemas que possam causar perda de dados.

O usuário deve receber uma mensagem compreensível quando houver risco real.

---

# 21. EQUIPE, CARGOS E PERMISSÕES

Papéis iniciais:

- Proprietário
- Administrador
- Gerente
- Despachante
- Vendedor
- Financeiro
- Técnico
- Estoquista
- Atendente
- Visualizador

Permissões granulares:

- Ver clientes
- Criar clientes
- Editar clientes
- Excluir clientes
- Ver orçamentos
- Criar orçamentos
- Ver preços
- Ver custos
- Ver margens
- Aplicar descontos
- Aprovar descontos
- Enviar propostas
- Converter em serviço
- Acessar financeiro
- Registrar pagamento
- Estornar
- Gerenciar equipe
- Ver localização
- Exportar dados
- Alterar configurações
- Alterar assinatura
- Ver auditoria

Permitir papéis personalizados no plano empresarial adequado.

---

# 22. FINANCEIRO OPERACIONAL

Não tente substituir contabilidade imediatamente.

Implemente primeiro o financeiro operacional:

- Contas a receber
- Contas a pagar
- Receitas
- Despesas
- Categorias
- Centro de custo
- Parcelas
- Vencimentos
- Pagamentos
- Inadimplência
- Fluxo de caixa
- Previsão
- Caixa realizado
- Comissões
- Lucro estimado
- Lucro realizado
- Custo por serviço

Integre:

- Orçamento
- Ordem de serviço
- Pagamento
- Recibo
- Assinatura
- Contrato

Preparar arquitetura para integrações futuras com:

- NFS-e
- Contabilidade
- Bancos
- PIX
- Asaas
- Stripe
- ERPs
- Open Finance

Não implemente integração fiscal sem considerar município, regras e fornecedor.

---

# 23. ESTOQUE, COMPRAS E FORNECEDORES

Adicionar progressivamente:

- Produtos
- Materiais
- Estoque
- Depósitos
- Estoque por veículo
- Entradas
- Saídas
- Ajustes
- Reserva para serviço
- Consumo em ordem de serviço
- Estoque mínimo
- Fornecedores
- Solicitação de compra
- Cotação
- Pedido de compra
- Recebimento
- Custo médio

Para usuários simples, esse módulo deve poder ficar oculto.

---

# 24. COMUNICAÇÃO

Centralizar interações relacionadas a:

- Lead
- Cliente
- Orçamento
- Ordem de serviço
- Cobrança
- Agendamento

## 24.1 WhatsApp

Suporte oficial do Olli:

`+55 11 94172-7487`

Implementar inicialmente:

- Botão de suporte
- Link `wa.me`
- Mensagem contextual
- Identificação não sensível da organização
- Plano
- Tela
- Categoria do problema

Para comunicação com clientes:

- Compartilhar orçamento
- Confirmar visita
- Avisar deslocamento
- Solicitar aprovação
- Enviar recibo
- Cobrar pagamento
- Solicitar avaliação

Não declare integração oficial com WhatsApp Business API sem credenciais, número aprovado, templates e webhooks.

Mantenha preparada uma camada de provider para futura Meta Cloud API.

## 24.2 E-mails

Separar:

### E-mails de autenticação

Usar Supabase Auth com:

- Domínio
- SMTP personalizado
- Templates
- Recuperação
- Confirmação
- Convites
- Alteração de e-mail

### E-mails transacionais

Utilizar backend seguro e provider apropriado.

Eventos:

- Orçamento enviado
- Visualização
- Aprovação
- Recusa
- Expiração
- Agendamento
- Reagendamento
- Técnico a caminho
- Serviço concluído
- Recibo
- Cobrança
- Pagamento
- Convite
- Alteração de plano
- Falha de pagamento

Criar:

- Templates responsivos
- Fila
- Retentativa
- Idempotência
- Logs
- Status
- Webhook de entrega
- Webhook de bounce
- Preferências
- Cancelamento quando aplicável

A Gmail API pode ser usada apenas para integrações autorizadas com a caixa postal do próprio usuário.

Ela não deve ser o motor principal de e-mails transacionais do SaaS.

---

# 25. PLANOS E ENTITLEMENTS

Não espalhe verificações como:

```ts
if (plano === 'pro')
```

por dezenas de telas.

Crie um sistema central de capabilities ou entitlements.

Exemplos:

- `quotes.monthly_limit`
- `quotes.templates`
- `quotes.remove_olli_brand`
- `team.max_members`
- `team.live_location`
- `reports.advanced`
- `inventory.enabled`
- `automations.monthly_limit`
- `storage.limit_mb`
- `ai.monthly_credits`
- `branches.max`
- `custom_roles.enabled`

## 25.1 Plano gratuito

O gratuito não deve ser quebrado ou humilhante.

Deve provar valor, com limites claros.

Possível estrutura inicial:

- Um usuário
- Quantidade mensal limitada de novos orçamentos
- Clientes
- Catálogo básico
- Agenda básica
- Um template
- Marca discreta do Olli
- PDF
- Compartilhamento
- Backup limitado
- Sem equipe
- Sem automações avançadas
- Sem relatórios avançados

## 25.2 Profissional

Para autônomos:

- Mais orçamentos ou ilimitados
- Todos os templates
- Sem marca do Olli
- Relatórios
- Automação
- IA
- Agenda avançada
- Recorrência
- Equipamentos
- Suporte prioritário

## 25.3 Equipe

Para pequenas equipes:

- Vários usuários
- Técnicos
- Permissões
- Despacho
- Localização
- Metas
- Comissões
- Auditoria
- Relatórios por funcionário

## 25.4 Empresa

Para operações maiores:

- Mais usuários
- Filiais
- Papéis personalizados
- Estoque
- Compras
- BI
- API
- Webhooks
- Suporte avançado
- Recursos administrativos

## 25.5 Mensal e anual

Exibir claramente:

- Preço mensal
- Preço anual total
- Economia
- Equivalente mensal do anual
- Quantidade de parcelas quando aplicável

Exemplo visual:

`R$ 948 por ano, equivalente a 12x de R$ 79`

Não diga que o anual está disponível enquanto o Price correspondente não estiver configurado e testado na Stripe.

## 25.6 Stripe

Implementar e validar:

- Mensal
- Anual
- Checkout
- Portal
- Upgrade
- Downgrade
- Cancelamento
- Reativação
- Webhooks
- Eventos duplicados
- Falha de pagamento
- Período de tolerância
- Status
- Produtos
- Prices
- Lookup keys
- Ambiente de teste
- Ambiente de produção

O webhook será fonte da verdade da assinatura.

O usuário não pode alterar seu plano diretamente no banco.

---

# 26. DASHBOARD WEB

A versão web empresarial deve possuir arquitetura própria.

## Navegação sugerida

- Visão geral
- Caixa de entrada
- Leads
- Clientes
- Orçamentos
- Serviços
- Agenda
- Despacho
- Equipe
- Mapa
- Equipamentos
- Contratos
- Financeiro
- Estoque
- Relatórios
- Automações
- Configurações

Menus devem variar conforme plano e permissão.

## Dashboard

Mostrar dados reais:

- Receita
- Receita prevista
- Orçamentos enviados
- Taxa de aprovação
- Ticket médio
- Serviços em andamento
- Técnicos ativos
- Atrasos
- Contas a receber
- Inadimplência
- Novos clientes
- Retenção
- Serviços recorrentes
- Margem
- Metas

Evitar painel decorativo cheio de gráficos sem ação.

Cada indicador deve permitir abrir os registros correspondentes.

---

# 27. EXPERIÊNCIA MOBILE

No aplicativo, priorizar:

- Início com ações do dia
- Novo orçamento
- Próximo atendimento
- Pendências
- Clientes
- Agenda
- Serviços
- Conta

Utilizar:

- Navegação clara
- Gestos previsíveis
- Feedback tátil
- Skeletons
- Estados vazios
- Autosave
- Indicadores de progresso
- Transições curtas
- Animações de sucesso moderadas
- Mensagens de erro úteis

Não anime tudo.

Movimento deve explicar mudança de estado, não servir de purpurina digital.

---

# 28. DESIGN SYSTEM

Consolidar:

- Cores
- Tipografia
- Espaçamentos
- Elevação
- Bordas
- Ícones
- Campos
- Botões
- Modais
- Tabelas
- Cards
- Badges
- Status
- Tooltips
- Toasts
- Skeletons
- Empty states
- Confirmações
- Motion tokens

Criar componentes reutilizáveis.

Garantir:

- Contraste
- Teclado
- Screen readers
- Tamanho de toque
- Zoom
- Redução de movimento
- Responsividade
- Estados de foco
- Estados desabilitados
- Erros de formulário

---

# 29. IDENTIDADE DA EMPRESA

Permitir:

- Logo
- Avatar
- Foto de capa
- Nome fantasia
- Razão social
- CPF ou CNPJ
- Telefones
- WhatsApp
- E-mail
- Site
- Endereço
- Cores
- Assinaturas
- PIX
- Dados bancários
- Termos
- Rodapé
- Redes sociais

Ao cadastrar logo pela primeira vez:

- Usar como avatar empresarial por padrão
- Permitir separar avatar e logo depois
- Gerar versões otimizadas
- Manter arquivo original
- Evitar distorção

Armazenar arquivos no Supabase Storage ou camada equivalente com RLS apropriada.

---

# 30. AUTOMAÇÕES

Criar motor gradual de eventos e ações.

Eventos:

- Lead criado
- Orçamento criado
- Orçamento enviado
- Orçamento visualizado
- Orçamento sem resposta
- Orçamento aprovado
- Serviço agendado
- Técnico despachado
- Serviço concluído
- Pagamento vencendo
- Pagamento atrasado
- Contrato renovando
- Manutenção próxima

Ações:

- Criar tarefa
- Enviar notificação
- Enviar e-mail
- Preparar WhatsApp
- Alterar status
- Atribuir responsável
- Criar agendamento
- Criar cobrança
- Gerar alerta

Comece com automações pré-configuradas.

Editor visual avançado pode vir depois.

---

# 31. IA NO OLLI

A IA deve reduzir trabalho, não ser um enfeite na navegação.

Casos úteis:

- Voz para orçamento
- Voz para relatório técnico
- Resumo do atendimento
- Sugestão de descrição
- Organização de fotos
- OCR de etiquetas
- Leitura de modelo e número de série
- Busca de códigos de falha
- Sugestão de checklist
- Follow-up de orçamento
- Classificação de lead
- Detecção de orçamento parado
- Resumo financeiro
- Consulta em linguagem natural

Regras:

- Usuário confirma preços
- Usuário confirma mensagens
- Técnico confirma diagnóstico
- IA não altera financeiro sem confirmação
- IA não envia comunicação sensível sozinha
- Registrar origem e confiança
- Não enviar dados desnecessários
- Permitir desligar
- Controlar consumo por plano

---

# 32. GOOGLE E OUTRAS APIS

Faça inventário das APIs disponíveis, mas não ative tudo.

Para cada API candidata, registre:

- Caso de uso
- Benefício
- Necessidade
- Dados enviados
- Escopos
- Custo
- Quota
- Risco
- Alternativa
- Cache
- Fallback
- Plano que terá acesso

Prioridade provável:

## Alta

- Google Identity
- Google Calendar API
- Maps
- Places
- Geocoding
- Address Validation
- Routes
- Firebase Cloud Messaging

## Média

- Drive para exportação autorizada
- Sheets para exportações
- Docs para modelos específicos
- Vision ou Document AI para OCR, após análise de custo
- Crashlytics ou serviço equivalente
- Remote Config ou feature flags equivalentes

## Baixa ou condicionada

- Gmail API
- Business Profile APIs
- Translation
- Route Optimization para equipes maiores

Não use Drive como banco de dados.

Não use Sheets como backend do produto.

---

# 33. SUPABASE

Aproveitar adequadamente:

- Auth
- PostgreSQL
- RLS
- Storage
- Realtime
- Presence
- Edge Functions
- Database Functions
- Triggers
- Webhooks
- Cron
- Logs
- Backups
- Advisors
- Custom SMTP
- MFA
- CAPTCHA
- Audit logs

Ativar proteção contra senhas vazadas quando compatível com o plano e configuração.

Revisar regularmente:

- Security Advisor
- Performance Advisor
- Índices
- Queries
- Policies
- Funções com privilégios
- Buckets públicos
- Tokens
- Redirect URLs

---

# 34. NOTIFICAÇÕES

Implementar arquitetura de notificações:

- Local
- Push
- E-mail
- WhatsApp preparado
- Central interna

Casos:

- Visita próxima
- Alteração de agenda
- Novo serviço
- Orçamento aprovado
- Pagamento recebido
- Pagamento atrasado
- Manutenção próxima
- Convite
- Menção
- Problema de sincronização

Permitir preferências por usuário e organização.

Evitar notificações duplicadas.

---

# 35. PORTAL DO CLIENTE

Criar portal público seguro para o cliente:

- Ver proposta
- Selecionar opção
- Selecionar adicionais
- Aprovar
- Recusar
- Informar motivo
- Assinar
- Pagar entrada
- Ver agendamento
- Ver técnico a caminho
- Ver documentos
- Baixar recibo
- Solicitar suporte
- Avaliar serviço

Links devem possuir:

- Tokens seguros
- Expiração configurável
- Revogação
- Rate limiting
- Logs
- Proteção contra enumeração
- Dados mínimos necessários

---

# 36. RELATÓRIOS

Começar pelos relatórios acionáveis:

- Funil de vendas
- Conversão
- Motivos de perda
- Receita
- Ticket médio
- Margem
- Custos
- Inadimplência
- Serviços mais vendidos
- Clientes recorrentes
- Produtividade
- Tempo em deslocamento
- Tempo no serviço
- Retorno técnico
- Orçamentos parados
- Contratos próximos
- Manutenções atrasadas
- Estoque crítico

Filtros:

- Período
- Filial
- Técnico
- Vendedor
- Equipe
- Serviço
- Segmento
- Cliente
- Status

---

# 37. SEGURANÇA E LGPD

Implementar:

- Minimização de dados
- Consentimento
- Política de retenção
- Exportação
- Exclusão
- Anonimização quando aplicável
- Controle de acesso
- Log de auditoria
- Criptografia em trânsito
- Gestão de secrets
- Rate limiting
- Validação
- Sanitização
- Proteção contra enumeração
- Sessões
- Revogação
- MFA para contas administrativas
- Alertas de novo acesso

Nunca registrar em logs:

- Senhas
- Tokens
- Chaves
- Conteúdo sensível completo
- Dados de cartão
- Documentos sem necessidade

---

# 38. OBSERVABILIDADE

Adicionar:

- Logs estruturados
- Identificador de requisição
- Erros de front-end
- Erros de Worker
- Erros de Edge Function
- Erros de sync
- Métricas de performance
- Alertas
- Status de integrações
- Histórico de webhooks
- Dead-letter ou fila de falhas quando necessário

Criar painel administrativo interno para:

- Organizações
- Usuários
- Assinaturas
- Erros
- Integrações
- Consumo
- Tickets
- Feature flags
- Auditoria

O painel administrativo nunca deve ser acessível apenas por esconder uma rota.

---

# 39. TESTES

Implementar testes em camadas.

## Unitários

- Cálculos
- Descontos
- Margens
- Totais
- Parcelas
- Status
- Entitlements
- Validações
- Conversões
- Formatação
- Sync

## Integração

- Supabase
- RLS
- Stripe
- Workers
- E-mails
- Storage
- Agenda
- Mapas
- Notificações
- PDFs

## E2E

- Cadastro
- Onboarding
- Criar cliente
- Criar orçamento
- Enviar
- Visualizar
- Aprovar
- Converter em serviço
- Agendar
- Concluir
- Registrar pagamento
- Emitir recibo
- Assinar plano
- Convidar funcionário
- Verificar permissão

## Segurança

- Isolamento entre organizações
- Tokens públicos
- Links expirados
- Escalonamento de privilégio
- Inputs maliciosos
- Rate limits
- Arquivos
- Webhooks falsos

## Offline

- Criar sem internet
- Editar sem internet
- Sincronizar
- Conflito
- Aplicativo fechado durante sync
- Rede intermitente
- Dois aparelhos

---

# 40. PERFORMANCE

Medir e melhorar:

- Tempo de abertura
- Tempo até interação
- Consultas
- Renderizações
- Listas grandes
- Imagens
- PDFs
- Bundle web
- Memória
- Bateria
- Dados móveis
- Sincronização
- Mapas

Utilizar:

- Paginação
- Virtualização
- Cache
- Lazy loading
- Compressão
- Thumbnails
- Índices
- Queries seletivas
- Atualizações incrementais

Não faça otimização imaginária.

Meça antes e depois.

---

# 41. ONDAS DE IMPLEMENTAÇÃO

## Onda 0

Auditoria, linha de base e documentação.

## Onda 1

Correções críticas, segurança, autenticação, e-mails básicos, navegação e erros.

## Onda 2

Arquitetura multiempresa, organizações, membros, convites, papéis e RLS.

## Onda 3

CRM, clientes, locais, leads e histórico.

## Onda 4

Reformulação de orçamento, propostas, versões, modelos e portal do cliente.

## Onda 5

Ordens de serviço, aplicação do técnico, checklists, fotos e assinatura.

## Onda 6

Agenda, despacho, Google Calendar, mapas e rotas.

## Onda 7

Pacote HVAC, equipamentos, manutenção e PMOC.

## Onda 8

Financeiro operacional, pagamentos, recibos, cobranças e contratos.

## Onda 9

Equipe, localização, metas, comissões e auditoria.

## Onda 10

Estoque, compras e fornecedores.

## Onda 11

Planos, entitlements, Stripe mensal/anual e portal de assinatura.

## Onda 12

Automações, notificações e comunicação.

## Onda 13

Relatórios, BI e painel administrativo.

## Onda 14

Pacotes para elétrica, hidráulica, pintura e construção.

## Onda 15

Performance, acessibilidade, segurança, QA, publicação e APK.

Cada onda deve preservar a aplicação utilizável.

---

# 42. GATES DE QUALIDADE

Uma onda só é concluída quando:

- TypeScript passa
- Testes relacionados passam
- Fluxo principal funciona
- Não há erro crítico no console
- Migrações estão versionadas
- RLS foi validada
- Documentação foi atualizada
- Não existem secrets no diff
- Mobile foi verificado
- Web foi verificada
- Offline foi considerado
- Regressões foram investigadas
- Evidências foram registradas

---

# 43. BUILD E APK

Não gere APK como gesto simbólico.

Antes da versão final:

- Typecheck limpo
- Expo Doctor aceitável
- Testes críticos verdes
- Build web concluída
- Build Android concluída
- Variáveis de produção validadas
- URLs corretas
- Stripe em modo correto
- OAuth correto
- Ícone
- Splash
- Permissões
- Política de privacidade
- Termos
- Exclusão de conta
- Notificações
- Deep links
- Assinatura
- Versionamento
- Crash reporting
- Testes em aparelho real

Gerar:

- Build de desenvolvimento quando necessário
- Build de homologação
- Build de produção
- APK somente para instalação direta
- AAB para Play Store quando aplicável

---

# 44. USO DO CHROME E FERRAMENTAS

Ao analisar a aplicação web:

Priorize:

- Código
- APIs
- CLI
- Logs
- Network
- Console
- Performance
- Lighthouse
- Playwright
- Testes automatizados
- Chrome DevTools Protocol
- Scripts controlados

Evite repetição manual de cliques quando puder automatizar.

Use inspeção para compreender:

- Requisições
- Erros
- Renderização
- Acessibilidade
- Performance
- Cookies
- Storage
- Deep links

Não use o navegador para contornar segurança.

Configurações administrativas devem ser feitas por:

- API oficial
- CLI
- Painel oficial quando indispensável
- IaC quando disponível
- Scripts auditáveis

---

# 45. FORMATO DE EXECUÇÃO

Ao começar cada onda, escreva:

```text
ONDA:
OBJETIVO:
ESTADO ATUAL:
RISCOS:
ARQUIVOS ENVOLVIDOS:
MIGRAÇÕES:
PLANO:
TESTES:
CRITÉRIO DE SAÍDA:
```

Ao finalizar:

```text
ONDA CONCLUÍDA:
ALTERAÇÕES:
COMMITS:
MIGRAÇÕES:
TESTES EXECUTADOS:
RESULTADOS:
EVIDÊNCIAS:
REGRESSÕES VERIFICADAS:
PENDÊNCIAS:
BLOQUEIOS EXTERNOS:
PRÓXIMA ONDA:
```

Não interrompa a execução para pedir confirmação sobre decisões pequenas.

Use julgamento técnico e registre decisões.

Solicite intervenção humana somente quando faltar algo realmente externo, como:

- Credencial
- Aprovação OAuth
- Domínio
- Conta Apple
- Configuração Stripe
- Número oficial do WhatsApp
- Serviço pago
- Decisão jurídica
- Publicação em loja

Mesmo nesses casos, implemente toda a parte independente.

---

# 46. DEFINIÇÃO DE PRONTO DO PRODUTO

O produto estará pronto para lançamento comercial quando:

- Autenticação funciona
- Recuperação funciona
- Onboarding funciona
- Organização é criada
- Dados são isolados
- Convites funcionam
- Permissões funcionam
- Clientes funcionam
- Orçamentos funcionam
- Propostas funcionam
- PDFs funcionam
- Portal funciona
- Aprovação funciona
- Ordem de serviço funciona
- Agenda funciona
- Técnico funciona offline
- Sincronização funciona
- Pagamento funciona
- Recibo funciona
- E-mails funcionam
- Notificações funcionam
- Assinaturas funcionam
- Mensal e anual funcionam
- Entitlements funcionam
- Dashboard usa dados reais
- Não existem botões críticos falsos
- Recursos incompletos estão ocultos
- Não existem secrets expostos
- RLS foi testada
- Build web passa
- Build Android passa
- Fluxos críticos E2E passam

A palavra “perfeito” não substitui evidência.

Use critérios mensuráveis.

---

# 47. PRIMEIRA AÇÃO

Comece agora pela Onda 0.

Não altere dezenas de arquivos imediatamente.

Primeiro:

1. Leia o repositório.
2. Execute a linha de base.
3. Mapeie a arquitetura.
4. Analise Supabase e Workers.
5. Analise a experiência mobile e desktop.
6. Compare o estado atual com este documento.
7. Crie a matriz de funcionalidades.
8. Classifique cada item como:
   - Funcional
   - Parcial
   - Visual apenas
   - Ausente
   - Quebrado
   - Bloqueado externamente
9. Defina o plano das três primeiras ondas.
10. Inicie a correção dos problemas críticos da Onda 1.

Não responda apenas com um plano.

Após a auditoria, comece a implementação da primeira onda viável.
