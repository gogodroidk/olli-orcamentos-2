# Revisão de segurança — Onda 1, Janela 1.3

Data: **27 de agosto de 2026**  
Escopo: `C:\OLLI_REL\docs\ONDA_1\JANELA_1_3`  
Veredito final: **PASS dentro da fronteira fixture-only**  
Achados reportáveis sobreviventes nessa fronteira: **0**

## Leitura correta do veredito

Este PASS afirma somente que os achados identificados no laboratório foram corrigidos e que não restou caminho reportável dentro do pacote local, sintético, offline e sem dados reais.

Ele não certifica o aplicativo inteiro, não valida produção e não substitui uma revisão posterior de autenticação, RLS, storage, infraestrutura, provider externo, privacidade ou assinatura qualificada.

## Fronteira revisada

A revisão cobriu integralmente:

- `package.json` e fixtures sintéticas;
- canonicalização e hash;
- contrato documental, aprovação, assinatura e retificação;
- cálculo privado e projeção pública do preço;
- contrato e provider determinístico de IA;
- SQLite/outbox, idempotência, conflito, membership, autorização, eventos e projeção;
- cinco arquivos de teste, inclusive o teste estático de isolamento.

Não houve rede, leitura de segredo, contato externo, acesso a produção, migration, Supabase, Worker ou alteração fora do diretório da janela.

## Método e limitações

Foram usados:

1. modelo de ameaças específico do recorte;
2. inspeção central de fontes, controles e sinks;
3. testes positivos, negativos e ponta a ponta;
4. varredura Gitleaks local;
5. dois revisores independentes, somente leitura: um para documentos/preço/IA e outro para outbox/tenant/autorização;
6. uma segunda revisão independente depois das correções.

O scanner integrado de revisão de mudanças não aceitou o subdiretório como alvo porque exigia a raiz do repositório Git. A raiz continha alterações preexistentes e alheias a esta janela; portanto, a análise não foi artificialmente ampliada nem apresentada como um scan integrado concluído. Foi mantida uma auditoria local estritamente limitada ao recorte. O status do painel TAC também não pôde ser verificado porque o conector não estava autenticado. Nenhuma dessas limitações reduz o escopo declarado; ambas impedem apenas afirmar que houve um relatório integrado/selado da ferramenta.

## Achados encontrados e encerrados

| ID | Problema original | Correção e evidência | Estado |
|---|---|---|---|
| `J13-PRICE-PUBLIC-MARGIN-LEAK` | Margem-alvo numérica e hash de cálculo privado alcançavam a visão pública. | `spikes/pricing/explained-pricing.mjs` mantém margem/hash somente na visão privada; `tests/pricing-ai.test.mjs` prova ausência na projeção pública. | Corrigido |
| `J13-DOC-EMPTY-REQUIRED-ROLES` | `requiredRoles: []` fazia `every()` concluir verdadeiro; uma recusa podia terminar como assinatura concluída. | O schema exige ao menos um papel único e somente eventos `signed` contam; teste negativo confirma `approved` após recusa. | Corrigido |
| `J13-AI-FREE-TEXT-PII` | Descrição livre com nome/endereço podia cruzar para o provider, mesmo sem e-mail/CPF/CNPJ. | O contrato efetivo não aceita texto livre: usa `serviceCode`; remove `description`, `label`, `explanation`, `assumptions` e `uncertainty`; o provider revalida o DTO. Teste com nome/endereço é rejeitado. | Corrigido |
| `J13-OUTBOX-AUTHZ-ROLE` | Membership ativa equivalia a permissão ampla; o papel não participava da decisão. | Política fail-closed de papel × comando; `viewer` e papel desconhecido são negados antes da mutação. | Corrigido |
| `J13-OUTBOX-TOCTOU-REVOCATION` | Membership era lida antes da transação de aplicação. | Membership, papel, idempotência, versão e mutações são avaliados sob `BEGIN IMMEDIATE`; atualizações de membership usam a mesma semântica transacional. | Corrigido |
| `J13-OUTBOX-SENSITIVE-SMUGGLING` | Blacklist de nomes permitia custo/margem/PII com aliases não listados. | Schemas de transporte allowlistados por agregado/operação e DTO documental público fechado; blacklist permanece apenas como defesa complementar. | Corrigido |
| `J13-MEMBERSHIP-VERSION` | Versão podia regredir ou mudar autorização sem avanço. | Regressão é rejeitada; mesma versão não pode alterar papel/status; testes negativos cobrem ambos. | Corrigido |
| `J13-OUTBOX-CLAIM` | Claim concorrente não exigia confirmação de uma única linha alterada. | O drain exige `changes === 1`; idempotência e constraints continuam protegendo o efeito canônico. | Corrigido |
| `J13-TENANT-READ-AUTH` | Leituras sintéticas não recebiam explicitamente uma sessão autorizada. | Leituras exigem `sessionUserId` e membership ativa; rebuild exige owner/admin; teste prova negação cross-tenant e leitura legítima. | Corrigido |
| `J13-LOCAL-QUEUE-MISMATCH` | Estado local e comando podiam transportar payloads divergentes. | Igualdade canônica é obrigatória; divergência aborta a transação inteira. | Corrigido |

## Verificação independente pós-correção

### Documentos, preço e IA

Veredito: **PASS**.

- margem e hash privados permanecem fora da visão pública;
- schema vazio e recusa não concluem assinatura;
- o payload efetivo do provider possui somente campos estruturados e exatos;
- nome/endereço em `description` é rejeitado no builder;
- labels e textos explicativos locais não são propagados ao provider;
- o próprio `FixtureAiProvider` revalida o contrato antes do uso.

### Outbox, tenant e autorização

Veredito: **PASS**.

- RBAC mínimo, pares de comando e papel desconhecido falham fechado;
- revogação e aplicação compartilham fronteira transacional;
- payloads não são objetos arbitrários;
- membership não regride;
- claim concorrente é verificado;
- leituras exigem sessão e tenant compatível;
- não restou achado reportável de autorização, isolamento, idempotência ou smuggling no fixture.

## Provas executadas no estado final

- `npm test`: **24 aprovados, 0 falhas**;
- regressões do produto: **383 aprovadas, 0 falhas**;
- `npm run typecheck`: **exit code 0**;
- `gitleaks dir . --no-banner --redact`: **no leaks found**;
- teste estático: sem rede, subprocesso, `process.env`, dependência externa ou dado real.

O snapshot executável que recebeu esses resultados é:

```text
90caa6328c882320cd3eadc1ca790619017500d9593bcfe7e99aaf63e3dd57fa
```

## Gates futuros — não são controles já existentes

### Evidência e storage

O fixture valida formato de SHA-256 e inclui o metadado no hash do documento. Um storage real ainda deve calcular o digest sobre os bytes recebidos, usar objeto/versionamento imutável e verificar esse binding antes de aprovação/assinatura.

### Renderização interna

O helper aceita `audience: internal` para testar projeções. Uma rota real não pode aceitar essa audiência como escolha livre: deve derivá-la de sessão, tenant, recurso e permissão.

### Texto livre e provider real

O provider de fixture recebe somente o contrato estruturado reduzido. Textos livres continuam existindo legitimamente no domínio; qualquer futura transmissão externa precisa de classificação, redaction, base legal/consentimento, política de retenção e adapter que preserve o DTO reduzido.

### Identidade e autorização reais

O SQLite simula membership e servidor. A integração deve possuir sessão verificável, autorização por recurso, RLS que falhe fechado, logs auditáveis sem conteúdo sensível, revogação autoritativa e testes cross-tenant no banco/serviço real.

### Store local e concorrência operacional

Uma implementação móvel deve decidir criptografia em repouso, ACL do arquivo, vínculo com sessão/dispositivo, backup, limpeza e testes com conexões/processos reais. O teste atual prova o protocolo local, não toda a plataforma operacional.

### Assinatura qualificada

O fixture só rejeita alegação falsa. Assinatura qualificada exige provider confiável, certificado, validação, carimbo temporal e política jurídica/técnica próprias.

## Disposição

- **PASS:** encerrar a revisão do fixture da Janela 1.3.
- **GO:** avançar para a arquitetura da Janela 1.4.
- **NO-GO:** tratar este documento como certificação do produto inteiro.
- **NO-GO:** conectar o fixture diretamente a dados reais, provider externo ou produção.
