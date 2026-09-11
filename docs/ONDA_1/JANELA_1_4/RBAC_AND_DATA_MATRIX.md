# Matriz RBAC/ABAC e classificação de dados

Estado: **baseline fail-closed para testes; configuração final de papéis exige validação de campo**

## 1. Princípios

- papel não é acesso geral: cada operação exige uma capacidade explícita;
- `owner`, `admin`, `manager`, `technician` e `viewer` são defaults de produto, não uma taxonomia jurídica;
- aprovador externo/cliente usa uma superfície pública restrita e não é membro interno por padrão;
- organização, ator, recurso, estado, atribuição, finalidade e versão participam da decisão;
- ausência de regra, papel desconhecido ou contexto incompleto falha fechado;
- RBAC interno do SaaS (`admin_memberships`) não se mistura à equipe da empresa (`organization_memberships`).

## 2. Papel × recurso × ação

Legenda: `S` permitido por default; `C` condicionado a capacidade/atribuição/estado; `N` negado por default.

| Recurso/ação | Owner | Admin | Manager | Technician | Viewer | Cliente/aprovador |
|---|---:|---:|---:|---:|---:|---:|
| empresa: ler configuração | S | S | C | N | N | N |
| empresa: alterar identidade/plano | S | C | N | N | N | N |
| membros: convidar/alterar/revogar | S | S | C | N | N | N |
| cliente/local: criar/editar | S | S | S | C | N | N |
| cliente/local: ler | S | S | S | C por atribuição | C | N |
| ativo/equipamento: criar/editar | S | S | S | S por atribuição | N | N |
| chamado/OS: despachar | S | S | S | N | N | N |
| chamado/OS: registrar execução | S | S | S | S por atribuição | N | N |
| orçamento: ver custo/margem | S | C | C | N | N | N |
| orçamento: criar rascunho | S | S | S | C | N | N |
| orçamento: publicar/desconto | S | C | C | N | N | N |
| documento: ler interno | S | S | C | C por atribuição | C | N |
| documento: aprovar/publicar | S | C | C | N | N | N |
| documento aceito: alterar | N | N | N | N | N | N |
| evidência: upload | S | S | S | S por tarefa | N | N |
| evidência: ler | S | S | C | C por tarefa | C metadado | somente a versão compartilhada |
| PMOC: editar plano mestre | S | C | C/RT | C tarefa, não plano final | N | N |
| PMOC: registrar preventiva | S | S | S | S por atribuição | N | N |
| IA: pedir sugestão | S | S | C | C caso permitido | N | N |
| IA: aplicar sugestão | decisão humana + capacidade específica | decisão humana + capacidade específica | condicionado | condicionado ao caso | N | N |
| dados: exportar organização | S | C | N | N | N | somente própria cópia documental |
| dados: excluir/reter | S condicionado à política | C | N | N | N | solicitação, não execução direta |

## 3. Atributos obrigatórios da autorização

| Atributo | Fonte autoritativa | Regra |
|---|---|---|
| ator | JWT/sessão válida | nunca aceitar `actor_user_id` do corpo |
| organização | membership ativa no servidor | contexto solicitado precisa pertencer ao ator |
| capacidade | política versionada | papel desconhecido não recebe fallback |
| recurso | linha canônica + organization_id | referência cross-tenant falha antes da mutação |
| atribuição | relação canônica | técnico só acessa o necessário ao trabalho |
| estado | máquina de estados do domínio | documento aceito não pode voltar a rascunho |
| versão | `expected_version` | divergência gera conflito, não overwrite |
| finalidade/audiência | derivada da rota/capacidade | cliente não escolhe `internal` livremente |

## 4. Classificação de dados

| Classe | Exemplos | Superfícies permitidas | Controles mínimos |
|---|---|---|---|
| público | nome comercial, descrição autorizada, escopo/preço do documento compartilhado | link revogável para versão específica | allowlist, token não enumerável, expiração, rate limit |
| interno | status operacional, agenda, checklist, resumo de OS | membros autorizados | sessão, tenant, capacidade, logs mínimos |
| restrito | contato/endereço, custo/margem, contrato, assinatura, fotos, áudio, laudo, dados de funcionário | funções específicas e atribuídas | RLS/ABAC, storage privado, criptografia, retenção, auditoria |
| segredo | tokens, chaves, cookies, credenciais, recovery codes | nenhum fluxo de domínio/documento/IA | cofre/env, nunca logar, nunca enviar a auxiliares/providers |

## 5. Visibilidade por bloco documental

| Bloco | Privado da empresa | Compartilhável com cliente | Provider de IA padrão | Analytics coletivo |
|---|---:|---:|---:|---:|
| custo, margem, overhead | sim | não | não | não |
| preço final e opções | sim | sim na versão publicada | estruturado e mínimo, se caso aprovado | não na V1 |
| cliente/contato/endereço | restrito | somente o necessário no próprio documento | não por default | não |
| escopo, inclusões/exclusões | sim | sim | somente caso allowlistado | não |
| assinatura/rubrica | restrito | cópia do próprio aceite | não | não |
| hash, versão, data, status | sim | parte do dossiê quando apropriado | metadado mínimo | agregado somente após política |
| fotos, áudio e anexos | restrito | apenas selecionados/autorizados | bloqueado por default | não |
| diagnóstico/laudo | restrito | versão final autorizada | rascunho mínimo, nunca conclusão autônoma | não |
| métricas de aceite | interno | não | não | somente após coorte/consentimento/anti-reidentificação |

## 6. Testes negativos mínimos

- outsider não lê nem enumera recurso da organização;
- membro revogado perde leitura/mutação no servidor, inclusive comando offline antigo;
- usuário multiempresa não cruza contexto entre A e B;
- técnico não vê custo/margem nem promove a si mesmo;
- viewer não muta;
- `organization_id`, `actor_user_id`, papel e audiência enviados pelo cliente não substituem a fonte autoritativa;
- relação cliente/local/ativo/documento cross-tenant falha atomicamente;
- cliente externo recebe somente versão congelada e allowlist pública;
- URL de evidência expira e membro revogado não gera nova URL;
- papel desconhecido, recurso ausente ou versão divergente falham fechado;
- administração interna do SaaS não concede acesso aos dados operacionais do tenant sem fluxo auditado específico.
