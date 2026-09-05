# Contratos de arquitetura — dados, documentos, evidências, preço e IA

Estado: **baseline aprovado para detalhamento; integração no runtime não autorizada**

## 1. Fronteiras de confiança

```text
cliente externo / link público
        |
        v  token restrito, versão congelada, allowlist pública
portal/API/Worker  <---- sessão/JWT ----  mobile/web autenticado
        |                                  |
        | autoriza, valida tenant,          | SQLite = réplica operacional
        | idempotência e versão             | outbox = intenção durável
        v                                  |
Postgres canônico  <-----------------------+
        |
        +--> Storage privado: bytes, digest, retenção e ACL
        |
        +--> providers externos: somente adapters allowlistados
```

Regras:

- cliente nunca é autoridade para `actor_user_id`, papel, audiência, custo, margem ou tenant;
- `organization_id` solicitado é contexto, não permissão; o servidor revalida membership/capacidade;
- `service_role` contorna RLS tecnicamente, portanto cada endpoint deve autorizar antes de tocar o banco;
- link público aponta para uma versão congelada e expõe apenas uma projeção allowlistada;
- provider externo recebe o menor DTO necessário, nunca um objeto de domínio cru;
- logs registram IDs opacos, código de erro, duração e versão, sem conteúdo de contrato, assinatura, foto, áudio ou PII excessiva.

## 2. Domínios e autoridade

| Domínio | Fonte canônica | Escritor autorizado | Observação |
|---|---|---|---|
| identidade e organizações | Auth + Postgres | funções/RPCs autorizadas | membership revogada precisa valer imediatamente no servidor |
| clientes, locais e ativos | Postgres V2 após cutover; V1 antes | um gateway de comandos por fase | relações precisam pertencer à mesma organização |
| documentos e versões | Postgres + snapshot imutável | serviço documental | rascunho é mutável; versão aprovada/aceita não é |
| bytes/evidências | Storage privado | adapter de upload autorizado | digest calculado sobre bytes recebidos pelo servidor |
| outbox mobile | SQLite local | transação do aplicativo | não é fonte empresarial final |
| idempotência/aplicação | Postgres/Worker | executor de comandos | mesma chave+payload retorna mesmo resultado; payload divergente falha |
| preço privado | domínio da organização | calculadora determinística | custo e margem nunca entram na projeção pública |
| analytics coletivo | inexistente na V1 | bloqueado | só após política de coorte/consentimento/qualidade |
| sugestão de IA | registro versionado de sugestão | adapter `AiProvider` | nunca vira preço/documento/ação sem decisão humana |

## 3. Entidades conceituais mínimas

### Identidade

- `organizations(id, owner_user_id, status, version)`;
- `organization_memberships(id, organization_id, user_id, role, status, version)`;
- `capabilities(code)` e política papel → capacidade;
- `active_organization` fica no contexto do dispositivo/sessão, sem substituir a reautorização.

### Operação

- `clients(id, organization_id, version, ...)`;
- `locations(id, organization_id, client_id, version, ...)`;
- `assets(id, organization_id, location_id, version, ...)`;
- `quotes(id, organization_id, client_id, location_id, status, version, ...)`;
- relações críticas validam co-tenancy por constraint composta ou RPC transacional.

### Documentos

- `document_instances(id, organization_id, schema_code, current_draft_version_id, status)`;
- `document_versions(id, document_id, schema_version, snapshot_json, canonical_hash, audience, created_by, created_at)`;
- `document_events(id, document_version_id, event_type, actor_user_id, occurred_at, metadata_allowlisted)`;
- `acceptance_records(id, document_version_id, role, identity_ref, method, occurred_at, evidence_digest)`;
- `evidence_refs(id, organization_id, document_version_id, storage_key, sha256, mime, size, retention_class)`.

### Sincronização

- `commands(command_id, idempotency_key, protocol_version, organization_id, aggregate_type, aggregate_id, operation, expected_version, payload)`;
- `command_results(command_id, payload_hash, status, resulting_version, safe_error_code)`;
- arquivos e blobs ficam fora do comando.

## 4. Kernel documental

Estados permitidos:

```text
draft -> in_review -> approved -> awaiting_acceptance -> accepted
   |         |            |                |
   +------> rejected <-----+----------------+

accepted --retification--> nova instância/versão; a anterior permanece imutável
```

Invariantes:

1. Cada schema possui código, versão, finalidade, jurisdição, fonte/licença, revisores requeridos e papéis de aceite.
2. `snapshot_json` contém somente os dados da versão; renderização nunca consulta campos mutáveis para reconstruir uma versão aceita.
3. O hash canônico cobre schema/version, snapshot, anexos referenciados e metadados relevantes ao aceite.
4. HTML/PDF/DOCX são renderizações daquele snapshot; o formato não é a fonte de verdade.
5. Aceite registra ação afirmativa, versão/hash, papel, identidade, data/fuso, método, IP/device apenas quando proporcional e política aplicável.
6. Rubrica desenhada não é anunciada como assinatura qualificada.
7. Retificação cria nova versão vinculada e nunca sobrescreve evidência anterior.

## 5. Evidência e storage

Contrato de upload futuro:

1. cliente solicita uma intenção de upload para organização/recurso/finalidade;
2. servidor autentica, autoriza e gera `storage_key` não enumerável;
3. adapter valida tamanho, MIME real, extensão, finalidade e limites;
4. bytes são recebidos em bucket privado;
5. digest SHA-256 é calculado/confirmado no servidor;
6. malware scanning/quarentena é aplicado conforme o tipo;
7. referência é ligada ao tenant e à versão documental;
8. download usa autorização por recurso ou URL assinada curta;
9. retenção/exclusão respeita obrigação e trilha, sem apagar silenciosamente documento aceito.

Não permitido:

- bucket público;
- chave baseada apenas em nome fornecido pelo usuário;
- confiar no hash enviado pelo cliente sem verificar bytes;
- URL assinada de longa duração;
- reutilizar arquivo de uma organização em outra;
- colocar base64/bytes na outbox ou em logs.

## 6. Precificação

Separar quatro objetos:

1. `PricingInputPrivate`: custo de material, mão de obra, deslocamento, impostos, overhead, margem-alvo e restrições da própria organização;
2. `PricingResultPrivate`: preço calculado, faixa, premissas, alertas e decomposição privada;
3. `PricingExplanationPublic`: escopo, itens, quantidades, preço, validade, opções e premissas permitidas ao cliente;
4. `PricingSuggestion`: sugestão de regra/IA com versão, fonte, confiança, premissas e decisão humana posterior.

V1:

- usa exclusivamente dados da própria organização e regras determinísticas;
- benchmark coletivo é `NO-GO`;
- preço ausente/ambíguo permanece pendente, nunca inventado;
- todo ajuste manual registra autor, motivo e versão;
- aceitação/rejeição do orçamento pode alimentar métricas internas, sem identificar outra empresa.

## 7. Porta de IA

Contrato conceitual:

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

O adapter futuro precisa impor:

- DTO allowlistado por caso de uso;
- classificação/redaction antes de egress;
- timeout, rate limit, cota, retry restrito e circuit breaker;
- provider fixture/local para testes;
- fallback determinístico sem IA;
- versionamento de prompt/política/modelo;
- log mínimo sem conteúdo sensível;
- confirmação humana para preço, contrato, laudo, mensagem, agenda e ação externa.

Casos iniciais permitidos no laboratório:

- transformar entrada estruturada em rascunho explicativo;
- apontar campos ausentes/inconsistentes;
- resumir eventos confirmados;
- sugerir descrição sem inventar execução, conformidade ou diagnóstico.

Casos bloqueados:

- definir preço final sozinho;
- aceitar contrato, cobrar, agendar, enviar mensagem ou publicar;
- declarar conformidade, ART, validade jurídica ou conclusão de laudo;
- comparar uma empresa identificável com outra;
- receber segredo, token, assinatura bruta, áudio/foto ou documento completo sem política específica.
