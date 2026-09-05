# Onda 2 — Janela 2.5: shadow-read e piloto local do Incremento A

Data: **2026-08-29**  
Estado: **LABORATÓRIO LOCAL — offline, em memória e sem integração de runtime**

## Resultado estreito desta fatia

Este pacote torna executável o contrato local de compatibilidade e troca de writer do Incremento A (`organization → client → location`). Ele não liga feature flag real nem altera a resposta exibida pelo produto.

```text
canônico V2 validado
  → projeção V2→V1 allowlistada e versionada
  → evento identificado por event_id + organização + agregado + versão
  → store aplica somente a próxima versão
      ├─ replay/stale → ignora sem regressão
      ├─ gap          → reporta e não aplica
      └─ divergência  → reporta e não repara
  → shadow compara canônico e legado sem mutá-los
  → gate interno de cutover consulta a projeção atual
  → somente match + mesma versão + outbox zerada permite V2 writer único
  → kill switch pausa writers; retomada exige nova comparação verde
```

## Matriz de fase e writer

| Fase | Writer oficial | V1 | V2 | Transição segura |
|---|---|---|---|---|
| `legacy` | V1 | permitido | recusado | pode habilitar observação shadow |
| `shadow` | V1 | permitido | somente observação | cutover exige evidência interna, versão igual e zero pendência |
| `pilot_v2` | V2 | `upgrade_required` | permitido | kill switch pausa novos comandos |
| `paused` | nenhum | `upgrade_required` | `kill_switch_active` | retomada exige novo match e zero pendência |

Não existe fase com dois writers independentes. Depois do cutover, rollback automático para V1 é bloqueado por `reconciliation_required`.

## Projeção e ordenação

- `client` projeta somente identidade, versão, nome público, status e data de atualização;
- `location` projeta somente identidade, versão, `client_id`, rótulo público, status e data;
- campos extras são recusados; custo, margem, payload e autoridade não atravessam a projeção;
- `location` exige o cliente-pai canônico validado por J2.1 e esse cliente precisa estar projetado no mesmo tenant antes do evento do local;
- a primeira versão aceita é `1`; a próxima precisa ser exatamente `atual + 1`;
- um `event_id` fica vinculado ao envelope completo: reutilizá-lo para outra versão, organização, agregado ou conteúdo gera `projection_divergence`;
- replay idêntico não duplica efeito; evento stale não regride; gap e divergência não fazem reparo automático.

## Comparação shadow

`compareShadow()` é uma função read-only. Ela produz apenas:

- versão do relatório e instante injetado;
- digest do escopo;
- tipo do agregado;
- estado `match`, `missing_legacy`, `missing_canonical`, `both_missing`, `version_mismatch` ou `field_mismatch`;
- versões canônica/legada e nomes allowlistados dos campos divergentes.

O relatório não contém valores divergentes, IDs brutos, nomes, payload, ator, device, lease, mensagem ou stack. A comparação nunca escolhe um lado, altera a UI, grava o canônico ou repara a projeção.

O `scope_digest` usa SHA-256 determinístico somente para a prova sintética local. Ele é pseudônimo linkável, não anonimização. Não deve virar telemetria acessível a tenants sem política futura de chave, retenção e acesso.

## Cutover e retomada

O chamador não informa `shadow_status`, canônico, cliente-pai, versão observada nem timestamp. `InMemoryPilotPolicyStore` recebe o projection store, um canonical store interno e um relógio injetado; a política lê o canônico corrente e calcula a evidência por conta própria.

O gate aceita somente:

```text
expected_policy_version
```

O `InMemoryCanonicalStore` é a implementação local da futura porta autoritativa. No runtime, um adapter dessa porta terá de ler o canônico e o pai co-tenant da mesma fonte transacional autorizada; repassar o objeto do request não satisfaz o contrato.

O cutover é NO-GO quando:

- não existe projeção interna atual;
- não existe canônico interno atual;
- escopo, tipo, campo ou versão diverge;
- a fase não é `shadow`;
- a versão da política mudou concorrentemente;
- `pending_outbox_count` não é zero;
- o chamador tenta fornecer canônico/timestamp ou usar o gate legado autoatestável.

O contador de pendências é apenas um contrato abstrato deste laboratório. Ele não prova drain ou reconciliação real da outbox J2.4; o futuro adapter deve fornecer essa evidência em uma janela própria.

O kill switch preserva contadores e trilha e não promove V1. `resumeV2()` volta ao V2 somente depois de uma nova comparação interna verde, versão de política atual, zero pendência e instante de evidência estritamente posterior ao último gate aceito. O timestamp vem do relógio interno injetado e não do chamador. Essas operações são controles internos do laboratório; não são endpoints autorizados para clientes.

## Autoridade e isolamento

- leitura da projeção deriva o usuário apenas de `session_user_id` no contexto confiável;
- membership precisa estar ativa e conter `clients_locations.read`;
- papel, organização ou membership fornecidos pelo chamador no contexto são recusados;
- store, política e projeção são particionados por `organization_id + aggregate_type + aggregate_id`;
- usuário multiempresa acessa somente a partição explicitamente solicitada e autorizada;
- usuário revogado e outsider não recebem a projeção;
- `location → client` é validado por co-tenancy e pela presença do pai projetado no mesmo tenant.

## Limites declarados

- tudo roda em memória e some ao encerrar o processo;
- não há SQLite, PostgreSQL, Supabase, RLS, Worker, rede, storage ou autenticação real;
- não há transação entre canônico, projeção, política e outbox;
- não há concorrência entre processos, persistência após crash ou relógio de aparelho;
- o laboratório não prova que `pending_outbox_count` corresponde a itens reais;
- não há migration, deploy, publicação, cobrança, contato ou escrita externa;
- nenhum arquivo de runtime em `src/**`, `web/**`, `webapp/**`, `worker/**` ou `supabase/**` faz parte desta janela;
- evidência local/sintética não equivale a piloto real, aceite de dispositivo ou aceite de produção.

## GO / NO-GO

**GO local** somente para congelar o contrato quando suíte, cobertura, sintaxe, regressões e revisão independente estiverem verdes.

**NO-GO** para integrar runtime ou banco enquanto não existirem, em janelas separadas:

1. porta de persistência transacional com crash/restart e concorrência;
2. vínculo comprovado com itens reais da outbox J2.4;
3. adapter/gateway com autenticação e autorização reais;
4. migration/RLS/grants ensaiados em ambiente efêmero autorizado;
5. aceite mobile/web, dois dispositivos, rede intermitente, revogação e rollback;
6. autorização humana explícita para qualquer ambiente remoto ou produção.

## Validação

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_5 test
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_5 run coverage
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_5\shadow\increment-a-shadow-pilot.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_5\fixtures\shadow-pilot-fixture.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_5\tests\shadow-pilot.test.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_5\tests\security-boundaries.test.mjs
```

## Próximo gate

Com J2.5 fechada e ainda sem integração, a próxima fatia autônoma é o kernel documental `quote@1` do Incremento B. Runtime, SQLite, PostgreSQL/Supabase, dados reais e produção continuam NO-GO e exigem tarefas e aceites próprios.
