# ADR-004 — Kernel documental, evidências, storage e níveis de assinatura

Status: **ACEITO COMO DIREÇÃO ARQUITETURAL LOCAL; NO-GO PARA RUNTIME, DADO REAL E PRODUÇÃO**  
Data: 2026-08-28  
Versão da decisão: **1.1**  
Dono: **Arquitetura de produto**, com aprovação obrigatória de **Segurança/Privacidade** e, conforme a família documental, **Jurídico/RT**

## Contexto

O OLLI já gera PDF/HTML e possui fluxos parciais de orçamento, contrato, PMOC, aceite e rubrica. A Janela 1.3 provou, em fixture, schema versionado, hash canônico, assinatura ligada à versão, recusa, retificação e separação entre dados privados/públicos. O runtime ainda não possui um kernel documental único nem storage privado/evidência real comprovados.

Usar o PDF como fonte de verdade, consultar dados mutáveis ao reabrir uma versão aceita ou chamar qualquer rubrica de assinatura qualificada destruiria a cadeia de evidência necessária ao produto.

## Escopo, não-escopo e substituição

Escopo desta decisão: fonte canônica documental, versionamento, estados, publicação, aceite/recusa, retificação, renderização, referência de evidência, armazenamento privado e níveis de manifestação eletrônica.

Não-escopo: emissão de ART/NFS-e/certificado, validação jurídica universal, storage real, provider real de assinatura, migrations remotas, dados reais e alegação automática de conformidade PMOC/ABNT/ANVISA/ICP-Brasil.

Dependências: ADR-001/003 para tenancy e convivência V1/V2, ADR-005 para autorização, catálogo documental J1.2, política de retenção/LGPD e contratos de renderer/storage.

Esta decisão só pode ser substituída por ADR posterior que preserve leitura e prova de todas as versões existentes, declare compatibilidade dos hashes, apresente migration/rollback compensatórios e passe pelos mesmos gates de segurança, jurídico/privacidade e RT aplicáveis.

## Fontes de autoridade e pontos de enforcement

| Decisão | Fonte autoritativa | Enforcement obrigatório |
|---|---|---|
| ator e papel | sessão validada + membership ativa | gateway/Worker e RPC transacional |
| organização do documento | recurso canônico persistido | gateway/RPC e RLS; nunca body/path isolado |
| schema/política | `schema_code`, `schema_version` e `acceptance_policy_version` homologados | comando de publicação e renderer |
| versão/estado/hash | `document_version` canônica | RPC de publicação/aceite e consulta pública |
| evidência | `evidence_ref` vinculada a tenant/recurso/versão | intenção/confirmação de upload, Storage policy e RPC |
| audiência pública | projeção allowlistada da versão + token opaco | gateway público e renderer |
| feature flag | configuração server-side por organização/caso | gateway/RPC; a UI nunca autoriza |

Entrada desconhecida, política ausente, versão divergente, hash incompatível, vínculo incompleto, scanner obrigatório indisponível ou autorização não comprovada resultam em negação ou estado `pending`; jamais há fallback permissivo.

## Decisão

Adotar um kernel documental próprio e independente do renderer/provider:

1. `document_schema` define código, versão, finalidade, campos, audiência, fontes/licenças, revisores e papéis obrigatórios;
2. `document_instance` representa o documento lógico e seu ciclo de vida;
3. `document_version` preserva snapshot canônico, schema version, hash, autoria e data;
4. `document_event` registra ações append-only;
5. `acceptance_record` liga identidade, papel, método, ação afirmativa, data/fuso e evidência ao hash exato;
6. `evidence_ref` liga bytes privados/versionados ao tenant, recurso, finalidade, digest, MIME, tamanho e retenção;
7. HTML, PDF e DOCX são renderizações do snapshot, nunca fonte canônica;
8. versão aprovada/aceita/assinada é imutável; correção cria nova versão/retificação vinculada.

O primeiro schema de implementação será `quote@1`. Contrato, OS, termo de entrega e PMOC só entram depois que a cadeia de snapshot → render → aceite → retificação estiver provada.

## Canonicalização e hash `olli-document-sha256-v1`

O hash documental é normativo e versionado:

1. o envelope contém, nesta ordem lógica, `hashAlgorithm`, `documentVersionId`, `schemaCode`, `schemaVersion`, `acceptancePolicyVersion`, `snapshot` e `evidenceRefs`;
2. `hashAlgorithm` é literalmente `olli-document-sha256-v1`;
3. strings são normalizadas em Unicode NFC; datas são strings ISO-8601 UTC com milissegundos (`YYYY-MM-DDTHH:mm:ss.sssZ`); números não admitem `NaN`, infinito ou `-0`, e valores monetários usam inteiros em centavos;
4. campos ausentes são omitidos; `null` explícito permanece; objetos têm chaves ordenadas lexicograficamente por code point; arrays preservam a ordem de domínio, exceto `evidenceRefs`, ordenada por `evidenceRefId` e depois `digestSha256`;
5. cada referência de evidência contém somente `evidenceRefId`, `digestAlgorithm`, `digestSha256`, `mimeType` e `sizeBytes` validados no servidor;
6. o JSON canônico não contém whitespace, é codificado em UTF-8 sem BOM e recebe SHA-256; a representação persistida é hexadecimal minúscula de 64 caracteres;
7. qualquer mudança nessas regras cria outro identificador de algoritmo; hashes antigos nunca são recalculados silenciosamente.

O hash do PDF/DOCX renderizado pode ser armazenado separadamente como prova dos bytes entregues, mas não substitui o hash canônico da versão.

## Atomicidade de publicação e aceite

`publish_quote` deve, na mesma transação, validar autorização/schema, congelar snapshot, criar versão, calcular hash, registrar evento e mover o estado para `awaiting_acceptance`. Falha parcial não publica nada.

`record_acceptance` deve, na mesma transação e sob proteção contra concorrência, validar documento, versão e hash exatos; estado `awaiting_acceptance`; prazo não expirado; token/link ativo e escopado à versão; identidade/papel exigidos; política vigente daquela versão; e inexistência de aceite concorrente incompatível. Versão expirada, revogada, retificada, substituída ou já concluída falha com código interno auditável e resposta pública anti-enumeração. Duas requisições idênticas usam idempotência e produzem um único registro válido.

## Níveis de manifestação

| Nível no OLLI | O que prova | O que não pode alegar |
|---|---|---|
| confirmação interna | colaborador confirmou uma etapa autenticada | aceite do cliente ou validade jurídica externa |
| aceite simples | ação afirmativa sobre versão/hash, com dossiê mínimo | assinatura avançada/qualificada por si só |
| rubrica desenhada | gesto vinculado ao aceite e à versão | identidade forte ou ICP-Brasil |
| assinatura avançada | somente por fluxo/provider que cumpra requisitos documentados | qualificada sem certificado ICP-Brasil |
| assinatura qualificada | referência verificável de provider/certificado aplicável | emissão própria pelo OLLI sem infraestrutura competente |
| documento externo | anexo/referência a ART, NFS-e, certificado ou documento oficial | autoria/emissão pelo OLLI |

O texto apresentado ao usuário e ao cliente deve corresponder ao nível efetivamente usado. O produto não promete resultado jurídico universal; contrato, finalidade, risco, legislação e revisão profissional continuam determinantes.

## Contrato de storage/evidência

O adapter futuro deve:

- autorizar intenção de upload por sessão, organização, recurso e finalidade;
- usar bucket privado e chave não enumerável derivada no servidor;
- autorizar novamente o recurso antes de gerar upload, confirmar upload ou emitir download;
- limitar tamanho, quantidade, taxa e tipos por finalidade; inspecionar os bytes para validar MIME real, sem confiar em extensão/header;
- bloquear SVG/HTML ativo, executáveis, compactados e tipos não aprovados; colocar em quarentena e falhar fechado quando o scanner obrigatório estiver indisponível;
- calcular ou confirmar SHA-256 sobre os bytes recebidos no servidor;
- vincular atomicamente `storage_key`, digest, tenant, recurso, versão, finalidade e retenção;
- registrar versão/imutabilidade quando a evidência participar de documento aceito;
- gerar download somente após autorização em tempo real ou URL assinada curta, revogável e restrita a um recurso; usar headers seguros e `Content-Disposition: attachment` quando aplicável;
- remover ou controlar metadados de imagem quando houver risco de localização/PII;
- revogar acesso de membro removido;
- aplicar retenção/exclusão por classe sem apagar silenciosamente evidência obrigatória;
- manter bytes fora de outbox, logs, analytics e payload padrão de IA.

As classes mínimas são `draft_disposable`, `published`, `accepted`, `evidence_retained`, `deletion_requested` e `legal_or_contractual_hold`. Exclusão e retenção devem registrar motivo/política; retificação, rollback ou desligamento de flag nunca apagam snapshot, hash, evento, aceite ou evidência preservada.

## Invariantes

1. Nenhum documento aceito depende de consulta a dado mutável para ser reconstruído.
2. O hash cobre schema/version, snapshot e referências relevantes de evidência.
3. Aceite sem papel obrigatório, ação afirmativa ou versão/hash falha fechado.
4. Recusa não produz estado aceito.
5. Retificação preserva versão, eventos, aceite e evidências anteriores.
6. Objeto de outra organização nunca pode ser ligado, listado, lido, substituído ou excluído.
7. Hash enviado pelo cliente não é aceito como prova dos bytes sem verificação server-side.
8. Link público expõe somente projeção allowlistada de uma versão específica, com expiração/revogação.
9. Renderer não recebe custo, margem, segredo ou campos fora da audiência.
10. Provider de assinatura fica atrás de uma porta; provider/licença não contamina o domínio.
11. Renderer recebe apenas snapshot congelado e metadados da versão; não consulta tabelas mutáveis de cliente, preço, marca ou termos.
12. HTML/PDF/DOCX publicado declara `document_version_id` e hash rastreáveis; conteúdo externo é escapado/sanitizado.
13. Bucket/objeto público, URL global persistente ou `storage_key` fornecido como autoridade pelo cliente são proibidos.
14. Rubrica desenhada permanece `drawn_mark`; não é promovida por texto a assinatura avançada ou qualificada.

## Auditoria, kill switch e testes obrigatórios

Eventos mínimos: `document_version_published`, `document_acceptance_attempted`, `document_accepted`, `document_rejected`, `document_rectified`, `evidence_upload_intended`, `evidence_upload_confirmed`, `evidence_access_denied` e `document_feature_disabled`. Cada evento guarda IDs opacos, organização, ator quando aplicável, versão/política, resultado/código e timestamp; não guarda conteúdo de documento, foto, áudio, assinatura, token ou PII desnecessária.

Kill switches `v2_document_publish_enabled`, `v2_acceptance_enabled` e `v2_evidence_upload_enabled` são server-side, por organização/caso, com owner operacional, motivo, expiração/revisão e métrica de acionamento. Eles bloqueiam novas mutações sem retirar leitura autorizada de versões aceitas nem apagar trilha/evidência.

Antes de qualquer piloto, testes executáveis devem provar:

- mesma estrutura com ordem diferente de chaves gera o mesmo hash; mudança em campo, anexo, versão ou política muda o hash;
- duas aceitações concorrentes geram um único aceite válido;
- token da versão A não lê, enumera nem aceita a B;
- expiração, revogação, retificação, estado/hash antigo e membro revogado negam;
- JPEG declarado com HTML, SVG ativo, executável, arquivo excessivo, compactado/zip bomb e scanner indisponível são rejeitados ou quarentenados fail-closed;
- `storage_key`/digest/tenant de A não se vinculam a B e URL expirada não renova sem nova autorização;
- alteração posterior de cliente, preço, logo ou termos não muda renderer/hash de versão aceita;
- texto documental hostil não executa HTML/JavaScript na web, link público ou PDF.

## Alternativas rejeitadas

- **PDF como fonte de verdade:** mistura dados e apresentação, dificulta validação, retificação e múltiplos renderers.
- **Regerar documento aceito a partir do banco vivo:** permite mudança silenciosa da prova.
- **Bucket público:** viola isolamento e torna revogação/retensão frágeis.
- **Confiar em hash do cliente:** não prova os bytes efetivamente armazenados.
- **Começar por provider externo de assinatura:** cria lock-in antes de o domínio estar correto.
- **Tratar rubrica como assinatura qualificada:** alegação tecnicamente e juridicamente indevida.
- **Copiar modelos/PDFs de terceiros:** risco autoral, regulatório e de identidade; os schemas devem ser próprios.

## Rollout

1. schemas/fixtures locais do kernel e `quote@1`;
2. testes de canonicalização, estado, aceite, recusa, adulteração e retificação;
3. adapter de renderer fixture/local;
4. storage fake com contrato idêntico ao futuro adapter real;
5. banco efêmero com RLS/ACL e bytes sintéticos;
6. mobile/web consumindo o mesmo snapshot em feature flag;
7. storage real privado e provider externo somente após gates;
8. ampliar documento por documento, começando por orçamento e termo de aceite.

## Rollback

- desabilitar criação/publicação/aceite V2 pela feature flag;
- preservar leitura de todas as versões e eventos já criados;
- manter V1 writer enquanto o agregado não tiver cutover;
- nunca apagar documento/evidência para voltar à V1;
- corrigir schema por nova versão/migration, não por reescrita retroativa;
- provider externo pode ser desligado sem alterar o modelo canônico.

## Consequências

Positivas:

- mesma prova em mobile/web/PDF;
- renderer e provider substituíveis;
- retificação auditável;
- caminho seguro para contratos, OS, PMOC e laudos;
- IA limitada ao rascunho, sem controlar a evidência.

Custos:

- versionamento e retenção mais complexos;
- necessidade de adapter de storage, scanner e política jurídica/privacidade;
- migração gradual dos geradores atuais.

## Gates antes de produção

- RLS/storage policies e testes cross-tenant em ambiente autorizado;
- digest de bytes, MIME, quota, malware/quarentena e URLs expirando;
- política de retenção/exclusão/LGPD;
- revisão jurídica das famílias de contrato/aceite;
- revisão RT/normativa para PMOC, laudos e documentos técnicos;
- provider/certificado comprovados antes de alegar assinatura avançada/qualificada;
- teste em aparelho físico, web e duas organizações;
- rollback ensaiado sem perda de versão/evidência.
- testes acima transformados em suíte executável e verdes com fixtures sintéticas/banco efêmero;
- proibição comprovada de dado real, credencial, provider externo e migration remota até autorização específica.
