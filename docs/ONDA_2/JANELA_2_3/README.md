# Onda 2 — Janela 2.3: gateway transacional local do Incremento A

Data: **2026-08-28**  
Estado: **LABORATÓRIO LOCAL — sem runtime, banco ou produção**

## O que esta fatia fecha

O pacote implementa em memória, com transação copy-on-write e fixtures sintéticas, a ordem normativa que o futuro gateway PostgreSQL deverá preservar:

```text
validar envelope não confiável
  → derivar actor apenas da sessão confiável
  → buscar organização + flag + membership atuais
  → negar revogado/papel sem capability
  → consultar chave idempotente por organização
      ├─ mesmo hash + mesmo ator: devolver resultado persistido
      ├─ outro ator: negar sem revelar o recibo
      └─ hash divergente: rejeitar sem sobrescrever
  → recusar command_id já reservado globalmente
  → buscar agregado/cliente canônicos
  → validar co-tenancy + expected_version
  → aplicar create/update e incrementar versão
  → persistir somente hash, metadados e safe_result
  → commit atômico
```

Isso transforma os P1 abertos na revisão da Janela 2.2 em comportamento executável offline: replay por hash e optimistic locking do agregado. Ainda não prova locks, isolamento ou RLS de um Postgres real.

## Reuso deliberado

- o gateway importa somente o contrato J2.1;
- organização, membership, cliente, local, comandos e resultados continuam validados pelo mesmo código;
- a migration J2.2 é referência de persistência futura, não dependência executada;
- nenhum objeto de contexto fornecido pelo cliente vira membership, papel, capability, tenant, versão ou resultado.

## Garantias do laboratório

- membership é reidratada no momento do drain; revogação bloqueia comando antigo e replay;
- idempotência é escopada por organização e o hash ignora somente campos de transporte definidos no contrato;
- `command_id` é reservado globalmente, acompanhando a chave primária prevista na migration J2.2;
- replay é vinculado ao ator original; outro funcionário autorizado não recebe o recibo pela mesma chave;
- mesma chave/hash não duplica efeito; chave/hash divergente não substitui o recibo original;
- dois updates com a mesma versão esperada resultam em um sucesso e um conflito explícito;
- local/cliente cross-tenant falha antes da mutação;
- flag server-side bloqueia novas escritas sem apagar estado;
- falha no callback transacional não comita draft parcial;
- callback assíncrono é recusado antes do commit, porque este store de prova é deliberadamente síncrono;
- ledger não persiste payload, nome, device, horário local ou segredo;
- erro de fronteira não ecoa conteúdo do comando.

## Limites da prova

- transação é um modelo síncrono copy-on-write, não MVCC/lock PostgreSQL;
- o store em memória é fixture, não adapter de runtime;
- não há rede, Supabase, RLS real, RPC, service role, Storage ou dados reais;
- conflitos/rejeições são persistidos para replay determinístico no modelo, mas a representação SQL/RPC final ainda precisa ser ensaiada;
- colisão de `command_id` usa `validation_failed` nesta versão compatível do contrato; um código dedicado exige evolução versionada de J2.1/J2.2;
- identificadores opacos do contrato local ainda exigem mapper UUID ou versão de contrato antes do adapter PostgreSQL;
- nenhum arquivo em `src/**`, `worker/**` ou `supabase/**` foi tocado;
- nenhuma migration foi aplicada.

## Validação

```powershell
npm --prefix C:\OLLI_REL\docs\ONDA_2\JANELA_2_3 test
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_3\gateway\increment-a-gateway.mjs
node --check C:\OLLI_REL\docs\ONDA_2\JANELA_2_3\fixtures\gateway-fixture.mjs
```

## Próximo gate

O comportamento deste pacote deve virar casos do harness PostgreSQL quando uma engine efêmera estiver disponível. Antes de integração no app, ainda são obrigatórios: adapter de persistência, transação/locks reais, RLS/grants executados, falhas por duas sessões e revisão de compatibilidade V1/V2.
