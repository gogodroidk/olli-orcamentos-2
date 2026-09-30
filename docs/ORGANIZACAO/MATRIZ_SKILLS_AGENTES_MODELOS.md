# Matriz de skills, agentes e modelos

Esta matriz evita fan-out aleatório e reserva o modelo forte para decisões que
podem afetar segurança, arquitetura, dinheiro, dados ou produção.

## Modelos

| Trabalho | Modelo/nível | Motivo |
| --- | --- | --- |
| Arquitetura, estratégia, segurança, migrations, billing, dados reais, síntese | Modelo principal forte, raciocínio alto/máximo | Julgamento e responsabilidade central |
| Inventário, catalogação, normalização documental, testes focados, fixtures | `gpt-5.6-luna`, máximo | Econômico e suficiente para trabalho mecânico bem delimitado |
| Revisão independente | Principal/reviewer forte, read-only | Separação entre autor e verificador |
| Governança do piloto | `olli_governor`, read-only | Continuidade, evidência e segurança |

O agente principal é o único que aplica mudanças finais, toma decisões, usa
credenciais autorizadas ou toca ambientes externos. Auxiliares recebem somente
contexto mínimo e sanitizado.

## Agentes por responsabilidade

| Perfil | Pode fazer | Não pode fazer sozinho |
| --- | --- | --- |
| `explorer` | Mapear código, referências, diretórios e contratos | Editar, mover, publicar |
| `worker` / `frontend` / `backend` | Implementação delimitada com ownership | Reverter mudanças alheias, usar produção |
| `qa` | Testes, reprodução e evidência | Aceitar produção em nome do dono |
| `reviewer` | Revisão independente read-only | Aplicar a própria correção |
| `security` | Auth, secrets, dados, permissões e superfície de ataque | Abrir secrets sem necessidade/autorização |
| `database` | Schema, SQL, RLS, índices e rollback | Aplicar migration em produção |
| `devops` | CI/CD, observabilidade e diagnóstico | Deploy/DNS sem autorização |
| `olli_governor` | Auditar início/fim e propor uma melhoria | Editar qualquer arquivo |

Limite normal do piloto com governador: no máximo **dois auxiliares de
execução**. Um terceiro agente só deve ser revisão especializada, sem escrita,
quando houver ganho real e recursos disponíveis.

## Skills por gatilho

| Skill | Quando usar | Observação |
| --- | --- | --- |
| `forca-total` | O dono pedir “força total”, “máximo” ou equivalente | Máximo útil, não máximo desperdício |
| `roteador-de-modelos` | Escolher custo/risco e confirmar modelos disponíveis | Nunca fingir troca de modelo |
| `ux-gate` | Antes de escrever/revisar UI, motion ou 3D | Gate obrigatório |
| `graphify` | Reconhecimento amplo quando o executável estiver saudável | Falha não bloqueia |
| Skills Expo relevantes | Mudança em app Expo/React Native | Ler docs v57 do repositório antes de código |
| Skills Resend/e-mail | Templates, provider, deliverability e inbox | Envio real exige identidade/secret/canário |
| Skills Supabase/Postgres | Schema, RLS e migrations | Produção read-only; migration exige aprovação |
| `pdf` | Criar ou verificar PDF | Renderizar e conferir antes de entregar |
| `arsenal-suprir` | Capacidade realmente ausente | Auditar antes de instalar |
| `supply-chain-audit` | Pacote, plugin, template ou componente novo | Licença e origem antes da instalação |

## Roteiro de cada fatia

1. Ler `RUN_STATE`, `NEXT_PROMPT`, ledger, HALT, quota e Git.
2. Confirmar item, DoD, allowlist, proibições e evidência esperada.
3. Invocar governador read-only.
4. Delegar apenas subtarefas independentes com ganho claro.
5. Renovar lease antes da tarefa e a cada dez minutos.
6. Implementar pelo agente principal, preservando a worktree.
7. Rodar teste focado, regressão proporcional e `git diff --check`.
8. Invocar revisão/governador final.
9. Registrar FIM, atualizar self-prompt e escolher o próximo item.

## Matriz rápida de decisão

| Se a tarefa envolve… | Rota |
| --- | --- |
| Texto, índices, hashes, inventário | Luna máximo + revisão |
| UI/UX | Principal + `ux-gate` + frontend/QA |
| Auth, RBAC, PII, admin | Principal forte + security |
| SQL/RLS/migration | Principal forte + database + security |
| E-mail/push real | Principal forte + skill específica + gate humano |
| Cobrança/trial/entitlement | Principal forte; sandbox primeiro |
| Build/distribuição | QA/DevOps; publicação somente autorizada |
| Produção, segredo, DNS, pagamento ou contato | Parar e solicitar autorização |

