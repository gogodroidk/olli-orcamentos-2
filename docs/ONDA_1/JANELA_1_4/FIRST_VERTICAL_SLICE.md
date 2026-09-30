# Primeira fatia vertical — tenant seguro e orçamento documentado

Estado: **contrato de implementação; runtime ainda não iniciado**

## 1. Objetivo de negócio

Provar que uma pequena empresa prestadora consegue:

1. trabalhar na organização correta;
2. cadastrar cliente e local sem vazamento entre empresas;
3. criar/publicar uma versão de orçamento;
4. entregar uma cópia congelada;
5. registrar aceite ligado exatamente à versão apresentada;
6. operar com rede instável sem duplicar ou sobrescrever silenciosamente.

## 2. Divisão em dois incrementos

### Incremento A — espinha de tenancy

Fluxo:

```text
organização ativa
  → cliente
  → local
  → comando idempotente
  → autorização no servidor
  → versão canônica
  → reconciliação local
```

Comandos mínimos:

- `create_client`;
- `update_client`;
- `create_location`;
- `update_location`.

Cada comando possui `command_id`, `idempotency_key`, `protocol_version`, `organization_id`, `aggregate_id`, `expected_version`, operação e payload allowlistado. Ator/papel não vêm do payload autoritativo.

### Incremento B — orçamento → documento → aceite

Fluxo:

```text
orçamento rascunho
  → cálculo privado + projeção pública
  → publish_quote cria snapshot/version/hash
  → renderer gera HTML/PDF do snapshot
  → link restrito apresenta a versão
  → record_acceptance liga identidade/método/data ao hash
  → evento/histórico e cópia permanecem imutáveis
```

Comandos mínimos:

- `publish_quote`;
- `register_document`;
- `record_acceptance`;
- `rectify_document`.

## 3. Escopo incluído

- organização, membership e capacidades mínimas;
- cliente e local;
- orçamento simples com itens, validade, preço final e projeção pública;
- snapshot próprio `quote@1`;
- renderização HTML e PDF a partir do snapshot;
- aceite simples/rubrica classificada corretamente, sem alegar assinatura qualificada;
- uma referência opcional de evidência privada já carregada por adapter;
- outbox apenas para os comandos deste recorte;
- feature flag por organização;
- compatibilidade de leitura V1 durante o piloto.

## 4. Fora de escopo

- PMOC completo, laudos finais, ART e conformidade normativa;
- benchmark entre empresas;
- cobrança real, NFS-e, fiscal ou pagamento do cliente-final;
- provider de assinatura qualificada;
- IA executando ação ou decidindo preço;
- upload livre de qualquer tipo;
- migração de todos os módulos;
- produção sem os gates do plano de migration.

## 5. Contratos de dados mínimos

### Projeção pública do orçamento

Permitido:

- identificação comercial necessária;
- cliente/destinatário necessário à própria proposta;
- escopo, inclusões/exclusões, itens, quantidades, preço, opções, validade, prazo e termos aprovados;
- versão, hash e instruções de aceite.

Proibido:

- custo, margem, overhead, score interno, regra de desconto, dados de outra empresa, token, chave, nota privada e prompt/modelo interno.

### Aceite

Campos mínimos:

- `document_version_id` e `canonical_hash`;
- papel/identidade do aprovador conforme o fluxo;
- método de autenticação/aceite;
- ação afirmativa e texto/versão exibidos;
- data/hora/fuso;
- ressalva ou recusa;
- referência da cópia disponibilizada;
- metadados técnicos proporcionais, sob política.

## 6. Compatibilidade mobile/web

- mobile grava mutação local + outbox na mesma transação;
- web usa o mesmo schema de comando online;
- Worker aplica a mesma autorização/idempotência;
- IDs são estáveis e gerados uma única vez;
- HTML/PDF precisam representar o mesmo snapshot, mesmo que o layout seja específico da plataforma;
- uma organização/agregado em piloto não recebe escrita V1 paralela;
- offline mostra estados `pending`, `acknowledged`, `conflict` e `rejected` sem esconder perda;
- link/aceite público possui fallback acessível e responsivo.

## 7. DoD mensurável

### Tenancy

- A cria e atualiza cliente/local; B não lê nem altera;
- usuário A+B escolhe organização explicitamente e cada comando permanece no tenant original;
- membro revogado tem comando offline rejeitado no drain;
- relações cliente/local cross-tenant falham atomicamente;
- viewer e papel desconhecido não mutam.

### Idempotência/conflito

- mesma chave+payload repetida dez vezes produz um efeito;
- mesma chave+payload divergente falha;
- `expected_version` divergente gera conflito explícito;
- fechar/reabrir app não perde comando;
- retry não duplica cliente, local, documento ou aceite.

### Documento/aceite

- alterar orçamento após publicação não muda versão já compartilhada;
- adulterar snapshot/hash invalida aceite;
- recusa não vira aceito;
- retificação cria nova versão e preserva a anterior;
- PDF e HTML usam o mesmo snapshot;
- custo/margem não aparecem no documento público, payload de IA ou analytics.

### Operação

- typecheck, testes unitários/contrato e regressões relacionadas passam;
- Gitleaks/Semgrep/OSV no recorte sem achado P0/P1 não aceito;
- logs não contêm PII/documentos/assinatura;
- rollback da feature flag e migration é ensaiado em ambiente efêmero;
- mobile real, web e duas organizações são testados antes do GO de release.

## 8. Ordem de implementação proposta na Onda 2

1. schemas compartilhados e fixtures sintéticas;
2. migrations aditivas e harness efêmero;
3. gateway de autorização/idempotência;
4. outbox do Incremento A;
5. shadow read e piloto do Incremento A;
6. kernel documental `quote@1`;
7. renderer do snapshot e aceite;
8. piloto do Incremento B;
9. revisão de segurança/privacidade/QA;
10. somente então ampliar para contrato/OS/PMOC.
