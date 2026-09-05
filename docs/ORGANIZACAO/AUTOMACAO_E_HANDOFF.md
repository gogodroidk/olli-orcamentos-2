# Automação e handoff do OLLI Orçamentos

Atualizado em: **2026-09-03**

Este documento explica por que a automação parecia repetir a mesma mensagem,
qual é o único identificador válido e como continuar em outra configuração de
modelo sem perder o ponto do plano.

## Diagnóstico comprovado

Havia dois identificadores históricos nas referências recentes. Nenhum deles
continuava atualizável no app:

| Identificador | Evidência | Decisão |
| --- | --- | --- |
| `piloto-olli-0-100-5h` | Aparece nos heartbeats históricos desta tarefa; a API informou que o job não existe mais | Histórico; não usar |
| `piloto-olli-0-a-100-continuidade-silenciosa` | Ficou gravado nos controles após uma tentativa anterior de recriação; a API informou que não existe | Histórico; não usar |
| `piloto-olli-0-100-continuidade-controlada` | Criado e confirmado pelo app nesta organização, já em estado `PAUSED` | **Canônico atual** |

O comando de visualização do app só exibiu um cartão genérico e, isoladamente,
não provava a existência da automação. A tentativa de atualização foi a prova
discriminante: os dois IDs históricos retornaram explicitamente que não
existem. Em seguida, o app criou e devolveu o novo ID canônico.

## Por que parecia travada

Não era falha de compilação nem falta de cota. O piloto tinha encerrado todos
os itens autônomos cadastrados e restavam somente gates humanos. Nesse estado:

1. `RUN_STATE.status` fica `blocked`;
2. o manifesto fica `PAUSED`;
3. uma retomada sem item novo é auditada no máximo uma vez;
4. a guarda anti-loop impede abrir outro `INICIO` para o mesmo trabalho;
5. pulsos sem mudança terminam silenciosamente.

Os heartbeats históricos apareciam com o primeiro ID, enquanto os arquivos
apontavam para o segundo. A correção foi criar uma única vigia controlada,
registrar exatamente o ID devolvido pelo app e deixá-la pausada quando não há
item executável.

## Estado depois desta organização

- automação canônica: `piloto-olli-0-100-continuidade-controlada`;
- cadência prevista: vigia de 15 minutos, não executor concorrente;
- estado correto ao fechar: `PAUSED`;
- motivo: `AUTONOMIA_ESGOTADA_ONLY_HUMAN_GATES`;
- repositório: `C:\OLLI_REL`;
- próxima retomada: somente após novo item seguro ou liberação explícita de um
  gate humano.

## Troca para Luna máximo

A documentação não consegue trocar o modelo principal de uma tarefa por conta
própria. O dono seleciona **Luna com raciocínio máximo** na interface e envia
uma nova retomada explícita. Depois disso, o agente deve:

1. ler `AGENTS.md` e todos os controles obrigatórios do piloto;
2. validar Git, HALT, cota e lease;
3. registrar um novo `run_id`, `handoff_id`, DoD e allowlist;
4. executar somente itens mecânicos, locais e reversíveis;
5. devolver arquitetura, segurança, migrations, cobrança, dados reais e
   produção ao modelo principal forte e ao gate humano correspondente.

## Contrato para a próxima retomada

Uma retomada só fica executável quando `NEXT_PROMPT.md` declarar, sem
ambiguidade:

- um único `itemId` em estado `ready` ou `running`;
- resultado esperado e critério de aceite;
- arquivos permitidos;
- ações proibidas;
- testes proporcionais;
- limite de evidência local versus aceite real;
- condição explícita de parada.

Sem esses campos, a automação deve continuar pausada. Isso evita tanto loops
quanto a criação artificial de trabalho fora do plano.
