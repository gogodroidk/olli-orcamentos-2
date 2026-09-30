# Decisão de passagem — Janela 1.4

Estado de entrada: **Janela 1.3 aprovada como laboratório fixture-only**  
Decisão recomendada: **GO para arquitetura; NO-GO para integração direta no runtime**

## Por que a Janela 1.4 existe

Os spikes provaram propriedades locais, mas deliberadamente não escolheram tecnologia de produção nem alteraram o aplicativo. A Janela 1.4 deve transformar essas propriedades em decisões arquiteturais verificáveis antes da Onda 2.

O objetivo não é reescrever o OLLI. É definir a menor integração segura e reversível com o que já existe, preservando dados, fluxo atual e compatibilidade móvel/web.

## Decisões obrigatórias

### 1. Núcleo documental

Definir:

- catálogo de schemas próprios e versionados;
- estados permitidos de rascunho, aprovação, assinatura, recusa e retificação;
- campos públicos, internos e restritos por tipo de documento;
- vínculo entre documento, orçamento, cliente, local, equipamento, chamado e contrato recorrente;
- estratégia de renderização PDF sem misturar snapshot assinado com dados mutáveis;
- trilha de auditoria e retenção.

Saída esperada: ADR, modelo de dados e contratos de entrada/saída.

### 2. Evidências, anexos e assinatura

Definir:

- upload privado com digest calculado no servidor;
- objeto/versionamento imutável ligado ao hash documental;
- autorização por organização, recurso e finalidade;
- MIME, tamanho, malware, retenção, expiração e exclusão;
- diferença explícita entre aceite simples, rubrica desenhada, assinatura avançada e qualificada;
- interface para provider externo sem prometer ICP-Brasil quando o provider/certificado não existirem.

Saída esperada: protocolo de evidência e matriz de assinatura.

### 3. Autenticação, usuários e autorização

Definir uma política fail-closed para:

- proprietário, administrador, técnico e visualizador;
- permissões por recurso e ação, não apenas por nome do papel;
- convites, revogação, troca de papel e recuperação de acesso;
- sessão, dispositivo, organização ativa e auditoria;
- leitura interna de custos/evidências versus visão do cliente;
- RLS e funções server-side sem confiar em `organizationId`, `actorId` ou audiência enviados pelo cliente.

Saída esperada: matriz RBAC/ABAC, ameaças e testes negativos obrigatórios.

### 4. Offline e sincronização

Comparar o protocolo provado na outbox com o mecanismo atual antes de substituir qualquer coisa. A decisão deve cobrir:

- quais comandos precisam de outbox;
- idempotência, versão esperada, conflito e retry;
- revogação entre enqueue e drain;
- anexos fora da fila de comando;
- migração gradual e rollback;
- compatibilidade entre celular e web;
- observabilidade sem registrar conteúdo sensível.

Saída esperada: ADR de sincronização e plano de adoção por fluxo, começando por uma fatia pequena.

### 5. Precificação e inteligência coletiva

Definir separadamente:

- cálculo privado da própria empresa;
- explicação pública enviada ao cliente;
- recomendação estatística agregada;
- sugestão de IA;
- decisão humana e histórico de aceite/edição/rejeição.

Dados de empresas diferentes não podem ser expostos nem usados como comparação identificável. A arquitetura deve estabelecer anonimização/agregação mínima, tamanho de coorte, consentimento/base legal, retenção, exclusão, qualidade e prevenção de reidentificação. Enquanto isso não existir, a sugestão usa apenas dados da própria organização e regras determinísticas.

Saída esperada: classificação de dados, fórmula V1, contrato de métricas e política de privacidade analítica.

### 6. Porta de IA

Definir uma interface independente de fornecedor com:

- DTO allowlistado por caso de uso;
- redaction/classificação de texto livre;
- provider local ou fixture para testes;
- provider gratuito somente quando houver uma integração oficial e limites conhecidos;
- fallback determinístico sem IA;
- rate limit, cota, custo, timeout, retry e circuit breaker;
- versionamento de prompt/modelo;
- rastreabilidade de premissas, confiança e incerteza;
- aprovação humana obrigatória para preço, contrato, laudo e ação externa.

Saída esperada: contrato `AiProvider`, política de egress e matriz caso de uso × risco.

## Ordem recomendada de implementação na Onda 2

1. Modelo de dados, tenant, sessão, RLS e auditoria.
2. Catálogo documental e storage privado de evidências.
3. Uma fatia vertical: orçamento → documento → aceite → histórico.
4. Outbox somente para essa fatia, com migração e rollback.
5. Precificação explicada da própria empresa.
6. IA assistiva em modo sugestão, com provider intercambiável e fallback.
7. Agenda, equipe e permissões ampliadas.
8. Estatística agregada entre empresas apenas após privacidade, consentimento e qualidade comprovados.

Essa ordem reduz dependências: IA, analytics e automação ficam apoiadas em identidade, dados e auditoria consistentes.

## Critérios de saída da Janela 1.4

A Janela 1.4 só termina quando houver:

- ADRs aprovados para documentos, autorização, storage, sync, precificação e IA;
- diagrama de dados e fronteiras de confiança;
- matriz de campos públicos/internos/restritos;
- matriz papel × recurso × ação;
- plano de migrations versionadas e rollback;
- plano de compatibilidade móvel/web;
- testes de contrato e ameaças que serão obrigatórios na Onda 2;
- uma fatia vertical escolhida com critérios de aceite mensuráveis;
- gates explícitos para credenciais, serviços pagos, produção e dados reais.

Até isso acontecer, os spikes permanecem referência executável e não código de runtime.
