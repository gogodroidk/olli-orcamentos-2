# Piloto OLLI 0→100 — protocolo contínuo com vigia inteligente de cota

Estado: **ativo por automação do Codex**  
Cadência: **um pulso silencioso de recuperação a cada 15 minutos; tarefas encadeadas sem espera artificial**  
Repositório canônico: `C:\OLLI_REL`
Versão do protocolo: **4.0.0**

> O nome histórico deste arquivo é preservado para não quebrar referências existentes. O intervalo real é definido pelo heartbeat ativo e por `RUN_STATE.json`. O pulso periódico é uma vigia de recuperação; ele não substitui nem limita a fila contínua executada dentro de cada turno.

## Objetivo

Executar, em fatias seguras e verificáveis, o programa OLLI já aprovado nas três ondas:

1. pesquisa e arquitetura;
2. criação do núcleo e das fatias verticais;
3. integração, testes, release controlada e aceite.

O piloto não inventa requisitos. As fontes de verdade são, nesta ordem:

1. instruções atuais do usuário e `AGENTS.md`;
2. `docs/PILOTO/NEXT_PROMPT.md`;
3. `docs/PILOTO/LEDGER_3_ONDAS.md`;
4. `docs/PILOTO/LEDGER_EVOLUCAO_AUTOMACAO.md`;
5. artefatos mais recentes em `docs/ONDA_1/`;
6. `docs/PLANO_3_ONDAS_OLLI_V2_2026-08-26.md`;
7. `docs/PLANO_MESTRE_OLLI_0_A_100_2026-08-25.md`;
8. o código e os testes do repositório vivo.

`docs/PILOTO/FILA.md` e `docs/PILOTO/LEDGER.md` preservam o piloto P0 histórico. A fila antiga já tem resumo terminal e não deve ser reexecutada nem alterada pela automação nova.

## Ciclo contínuo obrigatório

### 1. Preflight

1. Se `.claude/HALT` existir, não faça mutações; registre o estado e encerre.
2. Leia integralmente este protocolo, `RUN_STATE.json`, `NEXT_PROMPT.md`, `LEDGER_3_ONDAS.md` e os arquivos diretamente indicados pelo próximo prompt.
3. Leia `AGENTS.md` e `C:\Users\ADMIN\Desktop\CONFIG CLAUDE\ARSENAL.md` antes de trabalho substancial.
4. Confirme `git status --short --branch`, commit-base e diretório canônico.
5. Preserve toda alteração existente. Nunca use `reset --hard`, `checkout --`, limpeza ampla, stash automático, rebase, force-push ou exclusão recursiva.
6. Se houver uma linha `INICIO` sem `FIM` no ledger, retome aquela fatia depois de inspecionar o que já existe; não refaça cegamente.
7. Antes de mutar, adquira a lease lógica em `RUN_STATE.json`: grave `status=running`, `activeRunId`, `activeTask` e `leaseUpdatedAt`.
8. Se outro pulso encontrar `status=running` com lease atualizada há menos de 20 minutos, trate-o como duplicado: não faça mutação, não crie novo `INICIO` e encerre esse pulso.
9. Se a lease estiver vencida, verifique Git, ledger, arquivos e processos antes de retomá-la; nunca presuma que o trabalho anterior falhou.
10. Renove `leaseUpdatedAt` antes de cada nova tarefa e ao menos a cada 10 minutos durante uma tarefa longa.

### 1.2 Estado de cota e recuperação silenciosa

`RUN_STATE.json.quota.state` possui dois estados operacionais:

- `available`: a fila pode executar normalmente;
- `waiting`: a execução pesada está parada por um erro explícito de cota/limite de uso.

Regras obrigatórias:

1. Só classifique uma falha como cota esgotada quando o serviço retornar evidência explícita de limite de uso, janela esgotada, saldo indisponível ou horário de reset. Um `429` genérico, timeout ou falha de rede deve primeiro ser diagnosticado como erro transitório; não invente o motivo.
2. Quando a cota for identificada e ainda for possível persistir o estado local:
   - preserve a tarefa e o handoff ativos, sem marcar o DoD como concluído;
   - grave `status=quota_wait`, `quota.state=waiting`, `detectedAt`, `detectionSource` sanitizada e `resumeAfter` somente quando o próprio serviço fornecer horário exato;
   - registre `PAUSA-COTA` no ledger, atualize `NEXT_PROMPT.md` com a continuação exata e não abra outro `INICIO`;
   - notifique o dono no máximo uma vez sobre a pausa, registrando `detectedNotifiedAt`; depois, todos os pulsos iguais retornam silenciosamente.
3. Enquanto `quota.state=waiting`:
   - não execute tarefa, teste pesado, instalação, pesquisa, mutação ou fan-out;
   - se `resumeAfter` existir e ainda estiver no futuro, apenas mantenha o estado e encerre silenciosamente;
   - nunca envie mensagens repetidas de “ainda sem cota”.
4. A sessão atual não expõe uma API oficial de saldo/reset. Portanto, o primeiro heartbeat que conseguir iniciar após `resumeAfter` — ou, na ausência dele, conseguir concluir um preflight mínimo somente leitura sem novo erro de cota — é o sinal operacional de recuperação; não o descreva como leitura oficial de saldo.
5. Na recuperação:
   - grave `quota.state=available`, `recoveredAt`, `lastProbeAt`, limpe `resumeAfter` e marque `status=running` somente ao reassumir a tarefa;
   - verifique Git, ledger, arquivos e a lease antes de retomar do último ponto comprovado;
   - notifique o dono exatamente uma vez de que a capacidade voltou e a fila foi retomada, registrando `recoveryNotifiedAt`;
   - se o erro de cota reaparecer, volte a `waiting` sem repetir trabalho nem alegar recuperação.
6. Se o limite impedir até mesmo a execução do heartbeat, nenhum prompt consegue gravar estado ou descobrir o reset naquele instante. O agendador permanece como mecanismo externo de nova tentativa; o primeiro pulso que efetivamente rodar aplica as regras de recuperação acima.
7. Os pulsos sem mudança material devem terminar como `DONT_NOTIFY`. Só use `NOTIFY` para: primeira detecção da cota, primeira recuperação, marco material, bloqueio humano acionável ou conclusão comprovada.

### 1.5 Governança e evolução controlada

1. Gere `run_id` e `handoff_id` únicos antes de qualquer mutação e registre-os em toda nova evidência do ledger.
2. Invoque o perfil `olli_governor` em modo somente leitura antes da execução para auditar continuidade, invariantes, DoD, bloqueios e qualidade do handoff. Se o perfil ainda não estiver carregado na sessão, use temporariamente `reviewer` com o mesmo escopo e registre a limitação.
3. Leia `docs/PILOTO/LEDGER_EVOLUCAO_AUTOMACAO.md`.
4. O governador avalia o método em toda ativação, mas produz no máximo uma proposta. Ele não pode editar protocolo, self-prompt, automação, plugins, configurações, código ou infraestrutura.
5. A proposta precisa conter causa observável, evidência, severidade, benefício esperado, custo, risco, critério de aceite e rollback.
6. Só o agente principal pode aprovar e aplicar uma melhoria pequena e reversível. Propostas P1/P2 entram em observação por duas ativações; não abra outra proposta concorrente na mesma área.
7. Proposta P0 exige revisão independente de `security` ou `reviewer` antes da aplicação, salvo quando o único efeito imediato for interromper uma ação insegura.
8. Nunca altere por autoavaliação os gates humanos, a política de produção somente leitura, a proteção de secrets, o limite real de modelos ou o teto de auxiliares.
9. No encerramento, invoque novamente o governador para validar o handoff. Se não houver capacidade de segunda invocação, registre a limitação e faça o checklist no agente principal.
10. A evolução é orientada por evidência: se nenhuma melhoria justificável for encontrada, registre `OBSERVACAO` e mantenha o protocolo estável.

### 2. Fila contínua de tarefas

- O pulso/ativação é apenas uma ignição ou recuperação; ele não é a unidade de parada do trabalho.
- Execute uma tarefa delimitada por vez, com DoD mensurável e repositório recuperável.
- Ao concluir uma tarefa, prove o DoD, registre `FIM`, atualize imediatamente `NEXT_PROMPT.md` e selecione a próxima tarefa segura sem esperar o próximo pulso.
- Continue encadeando `selecionar → INICIO → executar → provar → FIM → self-prompt → próxima` enquanto a execução atual tiver capacidade e existir trabalho autônomo seguro.
- Não retorne ao usuário somente porque uma tarefa terminou. Retorne quando a execução realmente precisar encerrar ou quando houver uma atualização material útil, sem abandonar a fila.
- Respeite dependências: fundação de identidade/dados antes de analytics coletivo; storage/autorização antes de anexos reais; contrato de IA antes de provider externo.
- Se o próximo item depender de ação humana, marque `BLOQUEADO-HUMANO` e escolha outra fatia independente e segura.
- Não repita item com estado terminal, salvo regressão comprovada ou nova instrução explícita.

Condições legítimas de parada da execução atual:

- `.claude/HALT`;
- cota/limite do serviço indisponível;
- ferramenta exige interação humana imediata;
- somente gates humanos/externos permanecem;
- erro material repetido duas vezes sem alternativa segura;
- contexto/turno encerra por limite técnico do Codex;
- `PROGRAMA 100%` comprovado.

Ao parar por qualquer uma dessas condições, deixe `NEXT_PROMPT.md` acionável, feche/normalize o ledger e grave `RUN_STATE.json` como `idle`, `blocked`, `quota_wait` ou `complete`. Um pulso futuro retoma; não fica esperando deliberadamente quando ainda é possível continuar no mesmo turno.

### 3. Roteamento dinâmico de modelos

Antes de delegar, execute o inventário real:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.agents\skills\roteador-de-modelos\scripts\modelos-disponiveis.ps1" -Json
```

Interseccione o resultado com os modelos/perfis realmente oferecidos na execução atual.

- inventário, busca e transformação mecânica sanitizada: menor modelo comprovado, inclusive perfil gratuito quando disponível;
- código rotineiro e testes: modelo rápido/econômico com esforço médio;
- comparação, diagnóstico e revisão: modelo intermediário com esforço alto;
- arquitetura, segurança, migrations, autorização, dinheiro e síntese final: agente principal forte, esforço alto ou superior;
- máximo de três auxiliares simultâneos; quando `olli_governor` estiver ativo, reserve uma vaga a ele e use no máximo dois auxiliares de execução;
- nunca envie `.env`, credenciais, sessões, dados reais de clientes, banco ou configuração de produção a auxiliares externos;
- se a automação heartbeat não permitir mudar o modelo principal, não finja que mudou: varie somente auxiliares, esforço, contexto e decomposição.

### 4. Execução e prova

- Faça inventário antes de editar e use `apply_patch` para alterações manuais.
- Detecte a stack e rode somente testes relacionados, além dos gates proporcionais ao risco.
- Uma opinião de modelo não é prova. Use exit code, teste, build, inspeção de arquivo, hash, HTTP somente leitura ou validação estruturada apropriada.
- Não diga `DONE` se o DoD não foi comprovado.
- Em UI, carregue `ux-gate` antes de implementar/revisar.
- Em Supabase, use migrations versionadas, RLS fail-closed e rollback; produção permanece somente leitura até autorização específica.
- Para provider de IA, preserve DTO allowlistado, dados mínimos, fallback determinístico e confirmação humana.

### 5. Tratamento de erros e falta de ferramenta

1. Diagnostique a causa antes de repetir.
2. Registre comando, exit code e evidência sem expor segredos.
3. Tente no máximo uma alternativa técnica segura por execução.
4. Se o mesmo erro material ocorrer duas vezes, marque `TRAVADO` e avance para trabalho independente.
5. Quando faltar capacidade, consulte o arsenal e use `arsenal-suprir`; não instale componente, plugin ou pacote sem origem, licença e supply-chain audit.
6. Se a solução exigir senha, OAuth humano, pagamento, privilégio de administrador, reinício interativo, contato externo ou decisão de produto material, marque `BLOQUEADO-HUMANO` com instrução curta e exata.

### 6. Gates que a automação nunca ultrapassa sozinha

- credenciais, cofre, tokens e sessões;
- contato com clientes, entrevistas, mensagens ou convites reais;
- cobrança, pagamento, cancelamento ou assinatura real;
- escrita em banco de produção, DNS, Cloudflare, Supabase, EAS ou Play;
- deploy, publicação, indexação pública ou mudança de domínio;
- dados reais de clientes/funcionários;
- compra/licença da ABNT NBR 17037 ou afirmação de conformidade;
- merge, push, force-push ou reescrita de histórico;
- ação destrutiva ou difícil de recuperar.

O piloto pode preparar migrations, scripts, previews, testes, runbooks e checklists para esses gates, mas não aplicá-los externamente.

## Fechamento de cada tarefa e continuação

1. Acrescente uma linha append-only ao `LEDGER_3_ONDAS.md` com `INICIO` e outra com `FIM DONE`, `FIM PARCIAL`, `FIM BLOQUEADO-HUMANO`, `FIM BLOQUEADO-TECNICO` ou `FIM TRAVADO`. O campo de evidência de toda linha nova começa com `run_id`, `handoff_id` e versão/hash do protocolo.
2. Reescreva `NEXT_PROMPT.md` usando o contrato fixo de handoff:
   - `handoff_id`, `run_id`, horário e versão/hash do protocolo;
   - objetivo exato da próxima ativação;
   - estado verificado, comandos já executados e dependências;
   - arquivos autorizados/prioritários e arquivos que não devem ser tocados;
   - DoD e comandos de validação;
   - riscos, gates humanos, erros normalizados e o que não repetir;
   - decisão pendente, se houver;
   - modelo/esforço recomendado ligado ao inventário real;
   - checklist explícito de invariantes: sem produção, secrets, dados reais, pagamentos, deploy, push ou ação destrutiva.
3. Atualize `RUN_STATE.json` com a tarefa concluída, lease renovada, próximo item e estado de cota preservado.
4. Registre no `LEDGER_EVOLUCAO_AUTOMACAO.md` a avaliação do governador, a decisão sobre a proposta e o resultado observado das melhorias em acompanhamento.
5. Se existir outra tarefa autônoma segura, abra o próximo `INICIO` e continue no mesmo turno.
6. Informe ao usuário somente quando houver resultado material, primeira detecção/recuperação de cota, bloqueio, necessidade de decisão ou encerramento técnico; a resposta não deve transformar o próximo pulso em espera planejada.
7. Quando a execução realmente terminar, grave `RUN_STATE.json` como `idle`, `blocked`, `quota_wait` ou `complete`, mantendo IDs e handoff suficientes para retomada.

## Inventário controlado de capacidades

Antes de instalar ou integrar uma capacidade, registre:

- capacidade necessária e onda em que será usada;
- ferramenta, plugin ou conector existente;
- estado: `DISPONIVEL | NAO_INSTALADO | NAO_AUTENTICADO | BLOQUEADO-HUMANO | NAO_APLICAVEL`;
- fonte da verificação, origem/licença/supply chain e ambiente autorizado;
- decisão: reutilizar, avaliar, instalar mediante autorização específica ou não usar.

`Habilitado` não equivale a `autenticado`, e `autenticado` não autoriza produção. Nunca abra credenciais, cofre, sessão ou dados de cliente para preencher o inventário.

## Conclusão do programa

Somente marque `PROGRAMA 100%` quando todos os critérios aplicáveis do plano e da release estiverem comprovados no ambiente correto. Teste mockado não substitui aparelho real, sandbox não substitui produção e código preparado não substitui migration/deploy aplicado.

Quando todo trabalho autônomo estiver concluído, mas restarem gates humanos, use `AUTONOMIA ESGOTADA` e produza uma lista única e priorizada para o dono. Quando o produto estiver realmente aceito, marque `PROGRAMA 100%`, pause a automação recorrente pelo próprio ID/nome e não continue consumindo janelas.
