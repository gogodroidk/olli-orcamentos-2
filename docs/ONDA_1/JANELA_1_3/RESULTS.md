# Resultados — Onda 1, Janela 1.3

Data da validação: **27 de agosto de 2026**  
Repositório canônico: `C:\OLLI_REL`  
Base observada: `df63a25f25a57b9644995bf3adc63c098d0b3cb7`  
Disposição: **PASS no laboratório fixture-only**

## Resultado executivo

A Janela 1.3 provou, com dados sintéticos e código executável, os contratos mínimos para:

```text
preço explicado
  → payload público estritamente permitido
  → sugestão de IA revisável
  → documento versionado
  → aprovação/assinatura vinculada ao hash
  → mutação local + outbox atômicas
  → aplicação idempotente, autorizada e isolada por organização
```

Foram aprovadas **407 de 407 verificações executáveis**:

- **24/24** testes próprios da Janela 1.3;
- **383/383** regressões selecionadas do produto existente;
- **typecheck sem erro**;
- **Gitleaks sem vazamento detectado**.

Nenhum arquivo de runtime, migration, banco, Worker, Supabase, tela, webapp ou produção foi alterado nesta janela.

## Comandos e recibos

| Comando | Resultado verificado |
|---|---:|
| `npm test` em `docs/ONDA_1/JANELA_1_3` | 24 aprovados, 0 falhas |
| `npm run test:assinatura-cliente` | 78 aprovados, 0 falhas |
| `npm run test:contrato-prestacao` | 268 aprovados, 0 falhas |
| `npm run test:religar-sync` | 6 aprovados, 0 falhas |
| `npm run test:tenant-escrita` | 31 aprovados, 0 falhas |
| `npm run typecheck` | exit code 0 |
| `gitleaks dir . --no-banner --redact` no diretório da janela | `no leaks found`, exit code 0 |

Os quatro testes legados totalizam **383** verificações. Somados aos **24** testes novos, totalizam **407**. O aviso `MODULE_TYPELESS_PACKAGE_JSON` emitido pelos scripts legados é preexistente, não causou falha e não foi tratado nesta janela para evitar uma mudança transversal fora de escopo.

## Identidade do snapshot executável

O digest abaixo foi calculado sobre os caminhos relativos e SHA-256 de `package.json`, `fixtures/**`, `spikes/**` e `tests/**`, em ordem determinística. Documentação não participa do cálculo.

```text
EXECUTABLE_SNAPSHOT_SHA256=90caa6328c882320cd3eadc1ca790619017500d9593bcfe7e99aaf63e3dd57fa
```

Esse valor identifica exatamente o pacote que produziu os recibos acima. Se qualquer fixture, spike ou teste mudar, o digest precisa ser recalculado e toda a validação deve ser repetida.

## O que foi efetivamente provado

### Documento e assinatura

- schema próprio, versionado e validado;
- hash canônico estável e detecção de adulteração;
- assinatura ligada ao hash daquela versão;
- ao menos um papel de assinatura obrigatório e sem duplicidade;
- somente eventos `signed` dos papéis exigidos concluem o documento;
- recusa não transforma o documento em assinado;
- rubrica desenhada não se apresenta como assinatura qualificada;
- assinatura qualificada exige referências externas de provider e certificado;
- retificação cria nova instância e preserva a versão anterior.

### Precificação e IA

- cálculo determinístico com custo e margem restritos à visão privada;
- preço ausente permanece `null` e exige decisão manual;
- a visão pública não contém margem, custo nem hash derivado do cálculo privado;
- payload do provider usa allowlist exata, sem campos extras;
- o provider recebe somente código de serviço e dados estruturados; descrição, label, explicação, premissas e incerteza livres não cruzam essa fronteira;
- dados pessoais óbvios e aliases de campos privados continuam rejeitados como defesa adicional;
- provider determinístico revalida o contrato recebido;
- nenhuma sugestão vira rascunho sem decisão humana explícita.

### Outbox e sincronização

- mutação local e comando entram na mesma transação SQLite;
- fechamento/reabertura não perde comando pendente;
- idempotência impede efeito duplicado e rejeita reuso divergente da chave;
- conflito de versão é explícito, sem last-write-wins silencioso;
- sessão, membership, papel e operação são revalidados dentro da transação de aplicação;
- papel desconhecido e `viewer` falham fechado para mutações;
- versão de membership é monotônica e não muda autorização na mesma versão;
- payloads usam schema allowlistado por tipo/operação;
- payload local divergente do payload enfileirado aborta as duas gravações;
- leituras do estado sintético exigem uma membership ativa da organização;
- reconstrução de projeção exige papel administrativo;
- claim concorrente precisa alterar exatamente uma linha;
- recuperação pós-crash usa idempotência sem segunda mutação.

### Isolamento do laboratório

- sem `fetch`, HTTP, WebSocket, subprocesso ou leitura de `process.env`;
- sem dependência npm externa;
- sem Supabase, Worker, provider real, segredo ou dado de cliente;
- somente fixtures determinísticas e sem PII real.

## Defeitos encontrados durante a janela e encerrados

A revisão adversarial não serviu apenas para confirmar o código: ela encontrou e levou à correção de falhas concretas.

1. A margem-alvo e um hash privado podiam alcançar a visão pública de preço.
2. Um schema sem papel obrigatório, combinado apenas com recusa, podia resultar em status `signed` pela semântica de conjunto vazio.
3. Membership ativa equivalia a autorização ampla; o papel persistido não era usado.
4. A membership era verificada antes da transação de aplicação, abrindo uma janela TOCTOU de revogação.
5. A outbox dependia principalmente de blacklist de nomes e aceitava payloads semanticamente privados.
6. A versão da membership podia regredir ou alterar autorização sem avanço de versão.
7. Leituras sintéticas não exigiam explicitamente uma sessão membro.
8. Claim concorrente e divergência entre payload local/fila não falhavam com garantias suficientemente explícitas.
9. A descrição livre ainda permitia que nome/endereço alcançassem o provider de fixture, apesar do bloqueio de e-mail/CPF/CNPJ.

Todos esses pontos receberam controle de código e teste de regressão dentro do escopo fixture-only. A revisão completa e os gates futuros estão em `SECURITY_REVIEW.md`.

## O que não foi provado

Este resultado não prova que o produto em produção já possui esses controles. Também não prova:

- validade jurídica de contrato ou laudo;
- conformidade com ABNT, ANVISA, PMOC, ART ou conselho profissional;
- segurança de storage de anexos, autenticação, RLS ou infraestrutura real;
- privacidade de um provider externo de IA;
- assinatura qualificada sem integração com um prestador confiável;
- equivalência automática entre o SQLite sintético e o mecanismo de sincronização atual;
- pesquisa de campo concluída ou adequação de UX.

## Decisão

- **GO:** encerrar a Janela 1.3 como prova técnica fixture-only.
- **GO:** iniciar a Janela 1.4 para fechar arquitetura, fronteiras de dados e plano de integração.
- **NO-GO:** copiar os spikes diretamente para o runtime ou produção.
- **NO-GO:** conectar IA externa, storage real, assinatura paga ou banco multi-tenant antes dos gates definidos.

A proposta objetiva para a próxima janela está em `DECISION_JANELA_1_4.md`.
