# Contas INTERNAS × CLIENTES

Ordem do Igor (07/10/2026): contas da equipe (Igor, GR Tech, demo) **não podem entrar em nenhum número, anúncio, régua ou abordagem**.
Código: `supabase/migrations/20261007140000_contas_internas.sql`, `worker/src/contasInternas.js`, `worker/src/admin.js`, `worker/src/adminPagina.js`.
Testes: `scripts/teste-contas-internas.ts` (Postgres real, como `service_role`) e `worker/scripts/teste-contas-internas-admin.js`.

## Fonte única
Uma conta é **interna** se: está em `funil_exclusoes` (por id ou por e-mail — o "Marcar como conta interna" do painel), é
**administrador ativo** (`admin_memberships`) ou tem o e-mail do dono (`ADMIN_EMAIL`, só no worker). No banco a pergunta é uma só:
`public.conta_interna(user_id)`; para telefone, `public.conta_interna_por_telefone(telefone)`.

## O dono já nasce interno NO BANCO (semente)
`ADMIN_EMAIL` é uma env que só o worker enxerga; o banco não pode depender dela. A migration semeia `funil_exclusoes` (idempotente, por **id** e por
**e-mail** em qualquer caixa — vale também para uma conta recriada) com: `gogodroidk@gmail.com`, `igoreluisa@gmail.com`, `demo@grtech.com.br`
(motivo `dono/interna (semente)`; `criado_por` fica NULL — a coluna é uuid e não há usuário-autor). Os demais internos entram pelo painel.

## Conta de teste nasce interna (D-0914, 26/10/2026)
Ordem do Igor: contas de teste não contam como possível cliente. `20261026120000_conta_interna_teste.sql` acrescenta à `conta_interna`
o e-mail com etiqueta de teste (`+teste`, `+test`, `+qa`, `+e2e`, `+z99`, `+smoke`, `+probe`, `+agente` antes do `@`) e as caixas
`example.*`, `mailinator.com`, `yopmail.com`. **Regra para agentes:** não criar conta de teste em produção (use o Supabase de staging);
se for inevitável, o e-mail leva `+teste` e a conta já sai do placar, das métricas, da régua, do WhatsApp e dos anúncios.
Teste: `scripts/teste-contas-internas.ts` (caso positivo e caso de cliente comum com `+alias`). Apagar conta descartável é passo à parte
(há chaves `restrict` em `trials_comerciais` e `orcamento_envios_gratis`): usar o fluxo de exclusão de conta, com backup antes.

## Onde já vale
| O quê | Como |
|---|---|
| Painel ADM — contas, orçamentos, clientes, atividade, agenda, ativação | `metrics()` só de clientes; `users()` marca `interna`; abas **Clientes \| Internas** (padrão Clientes) com contagem |
| Receita (pagantes, MRR) | já excluía; o plano da interna aparece em "manuais", nunca como pagante |
| Medição do 1º orçamento (T1) | `primeiro_orcamento_por_conta()` pergunta `conta_interna` |
| Régua de e-mail | `listar_candidatos_lembrete_email` e `enqueue_lembrete_email` recusam (motivo `conta_interna`) |
| WhatsApp (SALES e guarda do #181) | `pode_contatar_whatsapp` devolve `{pode:false, motivo:'conta_interna'}` pela conta **e** pelo telefone |
| CAPI / anúncios | `anuncios_conversoes_pendentes` já exclui `funil_exclusoes`; **depois de aplicar o #182**, trocar a cláusula por `conta_interna` (cobre também administrador) |

## Organização interna (GR Tech)
Painel → **Organizações** → "Marcar como interna…":
1. mostra a **prévia** "N contas serão marcadas" (com e-mails) e quem fica de fora;
2. **salvaguarda:** quem também é dono/membro de OUTRA organização *cliente* **não** é marcado (suporte convidado num cliente continua cliente);
3. exige **motivo** e **digitar o N** da prévia; se a organização mudar entre a prévia e o clique, o banco recusa (`previa_mudou`);
4. tudo vai para a **auditoria** (`org_interna_marcada` / `org_interna_desmarcada`);
5. **Desfazer** (1 clique + motivo) remove só o que aquela organização marcou (`funil_exclusoes.org_id`); quem já era interno por conta própria continua, e quem também pertence a OUTRA organização que segue interna **não** volta a cliente (a marca passa para ela);
6. marcar/desfazer são **serializados** no banco (trava global) e o INSERT usa `ON CONFLICT DO NOTHING`: duas organizações que compartilham membro, ou uma marcação própria no meio do caminho, não estouram `23505` e só se conta o que foi realmente inserido.

## Erro nunca vira "só clientes"
Se a lista de internas não puder ser lida, o painel mostra **escopo indeterminado** (números incluem todas as contas e há aviso),
as abas avisam que não são confiáveis e a receita continua escondida. Nunca se afirma "só clientes" sem ter lido a lista.

## Passos de dados (não são migration — o Maestro/Igor faz depois da revisão)
1. Aplicar a migration `20261007140000` (aditiva). **Ordem:** antes de ligar o WhatsApp do #181 e antes de aplicar o #182.
2. As contas do dono e do demo **já vêm da semente** da migration. No painel: marcar a organização **GR Tech** (aba Organizações) e, se houver, outras contas da equipe (aba Usuários → conta → "Marcar como conta interna").
3. Conferir: Usuários → **Internas** mostra as contas; Visão geral diz "N conta(s) interna(s) fora".
