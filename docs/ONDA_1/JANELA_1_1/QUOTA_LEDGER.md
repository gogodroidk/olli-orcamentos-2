# Ledger de cota — Onda 1

Criado em: 2026-08-26

## 1. Regra de orçamento

| Item | Regra do plano |
|---|---|
| Trabalho ativo por janela | até 3h30 |
| Fechamento e handoff | 30 min |
| Reserva da janela de 5h | 1h |
| Limite por janela | menor entre 18% da cota semanal e 70% da cota de 5h |
| Janela 1.1 | 55k–80k tokens planejados |
| Janela 1.1 na semana | alvo de até 16% |

O teto em tokens é uma estimativa de planejamento, não um medidor do produto.

## 2. Observabilidade disponível

| Medida | Estado |
|---|---|
| Tokens exatos consumidos nesta tarefa | não exposto ao agente |
| Percentual exato restante da janela de 5h | não exposto ao agente |
| Horário exato de renovação da janela | não exposto ao agente |
| Percentual semanal restante | não exposto ao agente |
| Contador oficial da interface | somente o usuário consegue confirmar na área de uso |

Conclusão: não é possível afirmar que a Janela 1.1 consumiu X% nem fabricar uma contagem. Para fechar a medição oficial, o usuário deve copiar apenas os percentuais e horários exibidos pela interface de uso; não é necessário compartilhar conta, senha ou token.

O limite de cinco horas pertence ao produto/conta e não pode ser removido pelo código do projeto ou pelo agente. O plano reduz o risco de interrupção reservando 30% de cada janela e entregando um checkpoint independente ao final.

## 3. Registro da Janela 1.1

| Campo | Registro |
|---|---|
| Onda | 1 — Pesquisa |
| Janela | 1.1 — baseline, perguntas e cota |
| Modelo central | modelo atual da tarefa, raciocínio alto |
| Auxiliar de tenancy/segurança | gpt-5.6-terra, raciocínio alto, somente leitura |
| Auxiliar de superfícies/sync | gpt-5.6-luna, raciocínio alto, somente leitura |
| Fan-out máximo simultâneo usado | 2 |
| Alterações funcionais | 0 |
| Operações de produção | 0 |
| Deploys | 0 |
| Estado do medidor oficial | não observável |

Os auxiliares receberam frentes distintas. O agente central consolidou evidências, tomou as decisões e criou os artefatos.

## 4. Consumo por tipo de atividade

Como tokens reais não estão disponíveis, este quadro registra custo relativo e utilidade, sem números inventados.

| Atividade | Custo relativo | Resultado |
|---|---|---|
| Leitura do arsenal e health check | baixo | ambiente central validado |
| Snapshot Git e inventário de runtimes | baixo | baseline reproduzível |
| Inventário de tenancy/RLS | médio | riscos P0/P1 e testes negativos |
| Inventário de superfícies/sync | médio | quatro runtimes e dual-writes |
| Preflight root | alto | 43 testes passaram; Doctor isolou 16 patches |
| Builds webapp/site/Worker | médio | todas as superfícies reproduzidas |
| Auditorias de dependência e segredos | baixo | sem advisories ou achados reportados |
| Síntese e ADRs | médio | decisões propostas e rollback documentados |

## 5. Critérios de parada

Parar trabalho novo e entrar em fechamento quando ocorrer o primeiro:

- interface indicar 70% da janela de 5h;
- interface indicar o limite semanal definido para a janela;
- restarem 30 minutos para o checkpoint;
- surgir gate de credencial, produção, publicação, pagamento ou ação destrutiva;
- teste caro repetir o mesmo resultado sem nova hipótese;
- o escopo da próxima janela começar a invadir a atual.

## 6. Política de economia

- preferir rg, manifestos e consultas estruturadas;
- não repetir builds completos sem mudança relevante;
- reutilizar evidência já verificada e marcar sua data;
- delegar somente frentes independentes e somente leitura;
- usar auxiliares econômicos suficientes para inventário;
- reservar o modelo central para síntese, risco e edição;
- encerrar cada janela com artefato local que permita continuação sem reler toda a conversa;
- nunca gastar cota tentando contornar um limite que não é controlado pelo projeto.

## 7. Modelo para as próximas janelas

Preencher no começo:

| Campo | Valor |
|---|---|
| Janela | |
| Data/hora local | |
| Percentual de 5h exibido pelo usuário | |
| Renovação exibida | |
| Percentual semanal exibido | |
| Envelope planejado | |
| Entregável mínimo | |

Preencher no fechamento:

| Campo | Valor |
|---|---|
| Percentual de 5h final | |
| Percentual semanal final | |
| Gates verdes | |
| Gates vermelhos | |
| Arquivos criados/alterados | |
| Comandos que passaram | |
| Próxima ação única | |
