# ADR-007 — Porta de IA, egress, fallback, cota e aprovação humana

Status: **ACEITO COMO DIREÇÃO ARQUITETURAL E FIXTURE LOCAL; EGRESS/DADO REAL/RUNTIME NO-GO**  
Data: 2026-08-28  
Versão da decisão: **1.1**  
Dono: **Plataforma de IA**, com aprovação obrigatória de **Segurança, Privacidade e Produto** por caso de uso

## Contexto

O produto deseja IA em precificação, documentos, laudos, agenda, mensagens e operação. Hoje existem código/Worker e modelos possíveis, mas modelo gratuito/atual pode mudar, falhar, impor quota ou ter política inadequada. Acoplar o domínio a um fornecedor ou enviar objetos completos/PII criaria vazamento, lock-in e ações não auditáveis.

## Escopo, não-escopo e substituição

Escopo: porta/adapters, DTOs por caso, classificação/redaction, allowlist de egress, saída estruturada, aprovação humana, quota, rate limit, retry, circuit breaker, fallback, auditoria e kill switch.

Não-escopo: escolher provider pago/definitivo, autenticar conta, usar dado real, chamar modelo do cliente/browser, executar tools/ações, publicar/cobrar/agendar/enviar ou permitir URL/modelo arbitrário.

Dependências: ADR-005 para autorização, ADR-006 para dados de preço, contratos de cada caso, política de egress/subprocessadores/retenção e configuração server-side homologada.

Substituição exige ADR de adapter/policy versionado, avaliação de privacidade/segurança/custo, testes de regressão e rollback que não reenvia prompts antigos. Troca de provider nunca altera o contrato do domínio nem revisa automaticamente uma sugestão já aprovada.

## Decisão

Adotar uma porta `AiProvider` independente de fornecedor e fechada por caso de uso:

```ts
type AiRequest<TCase extends AiCase> = {
  case: TCase;
  organizationId: string;
  input: AllowedInputByCase[TCase];
  promptVersion: string;
  policyVersion: string;
};

type AiSuggestion<T> = {
  suggestion: T | null;
  assumptions: string[];
  uncertainty: string[];
  providerRef: string;
  modelRef: string;
  requiresHumanApproval: true;
};
```

Regras:

- cada caso possui DTO de entrada/saída allowlistado e validação server-side;
- egress ocorre somente no backend/Worker; cliente não define provider, base URL, modelo, headers, ferramentas nem timeout;
- allowlist fixa por ambiente/caso define providers/modelos homologados, timeout, tamanho máximo de entrada/saída e política de rotação; URL arbitrária, localhost e redes privadas são negados;
- credencial existe somente no ambiente server-side e nunca no bundle, prompt, resposta ou log;
- organização/ator/capacidade vêm do contexto autorizado, não do texto/modelo;
- texto livre e conteúdo importado são dados hostis e passam por classificação, minimização e redaction antes de egress;
- provider recebe o menor conjunto necessário;
- fixture/local e fallback determinístico existem antes do adapter externo;
- timeout, rate limit, quota, retry restrito, circuit breaker, latência e custo são observáveis;
- prompt, política, provider e modelo são versionados;
- logs contêm IDs opacos, versões, códigos, duração/uso — não prompt/resposta/PII integrais;
- toda saída é sugestão não executável até validação e decisão humana;
- troca de provider altera o adapter, não o domínio.

## Fontes de autoridade e enforcement

| Decisão | Fonte autoritativa | Enforcement |
|---|---|---|
| ator/tenant/capability | sessão + membership/capability atual | gateway/Worker antes do adapter |
| caso de uso/DTO | registry de casos e schemas versionados | validator/redactor server-side |
| provider/modelo/URL/limites | allowlist server-side por ambiente | adapter/egress proxy |
| prompt/política | versões homologadas no servidor | builder do request |
| quota/custo | contador persistido por organização/usuário/caso/janela | gateway antes/depois da chamada |
| aplicação da sugestão | ação humana + capability + recurso/versão atuais | comando de domínio transacional |

Ausência/divergência de policy, schema, consentimento quando aplicável, provider, quota ou autorização nega o egress. Provider indisponível, resposta parcial/malformada ou circuit breaker aberto produz fallback/estado explícito; nunca uma sugestão simulada.

## Contrato de dados e fronteira de ação

Cada caso declara campos permitidos, tamanho, classificação, finalidade, retenção e redaction. Por default ficam proibidos segredo/token, rubrica/assinatura, foto/áudio/anexo, documento completo, custo/margem, dado de outra organização e PII não indispensável.

Texto de cliente, contrato, PDF, laudo, e-mail, importação e resposta do modelo são não confiáveis. A saída é schema-validada e escapada; não chama ferramenta, altera banco, envia mensagem, agenda, publica, aceita documento ou define preço final. Aplicar sugestão exige confirmação humana explícita, capability, ator, recurso/versão, `promptVersion`, `policyVersion`, provider/modelo, premissas e incerteza auditáveis. Persistir sugestão não a torna verdade canônica.

## Cotas, fallback e auditoria

Limites server-side são definidos por organização, usuário, caso, janela, bytes/tokens, concorrência e orçamento. Timeout não dispara requisições ilimitadas; retry é restrito, usa idempotência quando possível e nunca repete falhas definitivas de autorização, validação ou quota. Circuit breaker opera por provider/caso e expõe somente estado/código seguro.

Fallback permitido: ausência explícita de sugestão, checklist/regra determinística ou manutenção do rascunho manual. Ele não infere preço, diagnóstico, conformidade ou termo jurídico; não reutiliza cache/resposta de outro tenant nem persiste parcial como válida.

Eventos mínimos: `ai_egress_requested`, `ai_egress_denied`, `ai_provider_failed`, `ai_circuit_opened`, `ai_quota_exceeded`, `ai_suggestion_created`, `ai_suggestion_approved`, `ai_suggestion_rejected` e `ai_feature_disabled`. Guardar IDs opacos, caso, versões, provider/model ref homologados, latência/uso agregado, resultado/código e timestamp; nunca prompt, resposta bruta, segredo, token, documento, PII, custo ou margem.

Kill switch `ai_suggestion_enabled` é server-side por organização/caso/provider, com owner, motivo, expiração/revisão e métrica. Desligá-lo preserva fluxo manual e histórico seguro; não reenvia nem reprocessa ações.

## Casos iniciais permitidos

- rascunho a partir de dados estruturados;
- detecção de campo ausente/inconsistente;
- resumo de eventos confirmados;
- descrição técnico-comercial sem inventar execução/diagnóstico/conformidade;
- sugestão de faixa/preço somente sobre dados permitidos e com decisão humana.

## Casos bloqueados

- definir/publicar preço final sozinho;
- aceitar contrato, cobrar, agendar, enviar mensagem ou publicar;
- afirmar conformidade, ART, validade jurídica ou conclusão técnica;
- comparar empresas identificáveis;
- executar ferramenta/ação por instrução contida em documento, e-mail, foto, prompt ou saída do modelo;
- receber segredo, token, assinatura bruta ou documento completo sem caso/política específicos.

## Invariantes

1. Egress é allowlistado por caso de uso e negado por default.
2. Prompt injection não amplia tools, dados, tenant ou autoridade.
3. Provider indisponível não bloqueia o fluxo principal quando fallback é possível.
4. Quota/custo excedidos geram estado explícito e seguro.
5. Retry automático não ocorre para autorização, validação ou quota definitiva.
6. Sugestão nunca vira ação sem evento humano/capacidade apropriados.
7. Modelo não recebe custo/margem/PII fora do contrato daquele caso.
8. Versões de prompt/política/provider/modelo permanecem rastreáveis.
9. Saída é validada contra schema e conteúdo permitido antes de chegar ao domínio.
10. Nenhum provider externo é fonte de verdade do documento, preço, agenda ou execução.
11. Cache, quota e `providerRef` são tenant-scoped e não revelam conteúdo entre organizações.
12. Logout/troca de empresa invalida sugestão pendente local para aplicação até nova autorização.

## Testes negativos obrigatórios

Antes de provider sandbox ou piloto, testes executáveis devem provar:

- payload tentando URL externa arbitrária, localhost/IP privado, provider/modelo/header/tool não homologado falha antes do egress;
- prompt hostil pedindo segredo, ferramenta, regra diferente ou dado de outro tenant não amplia escopo;
- campo extra/alias de PII, custo, margem, assinatura ou anexo é rejeitado pelo schema/redactor;
- timeout, indisponibilidade, quota, circuit breaker e resposta malformada produzem fallback manual seguro;
- mesmo erro não causa retry/cobrança multiplicados;
- sugestão sem confirmação/capability não muda preço, orçamento, documento, agenda, mensagem ou estado;
- HTML/script na saída é escapado em app, web e PDF;
- tenant A não recebe cache, log, quota, sugestão ou `providerRef` de B;
- logout/troca de empresa bloqueia aplicação de sugestão pendente;
- scanner de observabilidade rejeita prompt/resposta/PII/segredo/conteúdo documental.

## Alternativas rejeitadas

- **Tela chamando API externa diretamente:** expõe chave/PII e ignora política central.
- **Acoplar domínio a um modelo/fornecedor:** gera lock-in e fragilidade operacional.
- **Enviar objeto de domínio completo:** viola minimização e aumenta prompt injection/exfiltração.
- **Usar “grátis” sem termos/limites conhecidos:** gratuito não prova segurança, licença ou disponibilidade.
- **Registrar prompt/resposta integral em logs:** risco de segredo/PII/documento.
- **Permitir tool/action automática no primeiro corte:** custo do erro é alto demais.
- **Sem fallback:** transforma um recurso assistivo em ponto único de falha.

## Política de falhas

| Falha | Comportamento |
|---|---|
| timeout/transitória | no máximo retry seguro com backoff/jitter; depois fallback |
| quota/rate limit | informar indisponibilidade/alternativa, não trocar provider silenciosamente sem política |
| autenticação/configuração | bloquear adapter, registrar código sanitizado, exigir gate humano |
| saída inválida | rejeitar; nunca aplicar parcialmente |
| conteúdo inseguro/injeção | rejeitar/minimizar e manter fluxo determinístico |
| circuit breaker aberto | fallback e telemetria mínima |

## Rollout

1. schemas e `FixtureAiProvider` offline;
2. testes de allowlist, redaction, injection, saída inválida e decisão humana;
3. fallback determinístico por caso;
4. harness de timeout/quota/retry/circuit breaker;
5. provider oficial em sandbox com dados sintéticos;
6. feature flag `ai_suggestion_enabled` por caso/organização;
7. revisão de egress/privacidade/segurança;
8. dado real somente após autorização específica e minimização comprovada;
9. provider/modelo mais potente entra pela mesma porta e por avaliação versionada.

## Rollback

- desligar a flag por caso/organização/provider;
- usar fallback/regra determinística;
- preservar sugestões anteriores como sugestões, com versões/premissas;
- bloquear pendência sem confirmação humana;
- não apagar histórico para esconder sugestão incorreta;
- trocar/revogar adapter sem mudar o contrato canônico.

## Consequências

Positivas:

- modelos gratuitos/agora e pagos/futuros são substituíveis;
- egress/PII controlados por caso;
- operação funciona sem IA;
- auditoria de sugestão e custo.

Custos:

- adapters, schemas, políticas e testes por caso;
- respostas menos flexíveis quando DTO é estrito;
- necessidade de governança contínua de providers/modelos.

## Gates antes de dado real/produção

- provider, conta, credencial e termos autorizados;
- política de subprocessadores/egress/retenção/base legal;
- teste de prompt injection, exfiltração e saída malformada;
- quota, custo, rate limit, timeout e circuit breaker;
- fallback e UX de indisponibilidade;
- scanner de logs sem PII/segredo/conteúdo documental;
- aprovação humana comprovada em preço, contrato, laudo, mensagem e ação externa;
- revisão de segurança e privacidade;
- autorização explícita antes de enviar qualquer dado real.
- suites acima verdes com fixture/local e provider sandbox oficial usando somente DTO sintético/minimizado;
- provider indisponível demonstrado sem quebrar o fluxo manual nem criar ação automática.
