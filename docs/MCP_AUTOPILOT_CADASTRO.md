# MCP de cadastro — spec técnica (D-1438 G21)

Data: 03/11/2026. Item do áudio de 27/10: a IA mexe em cadastro e em cláusula de documento sem mexer no código.

Esta entrega é o contrato executável. O servidor roda em memória, com teste. Não há rota no Worker, não há linha no `.mcp.json` e a migration **não foi aplicada**.

## Reuso

Já existiam três peças nossas: `src/services/olliAcoesSeguras.ts` (prévia, papel e journal), `worker/src/iaActions.js` (token com hash, compare-before e rollback) e os tetos de `src/utils/contratoPdf.ts` (multa de 2% pelo CDC art. 52, §1º). O chat continua dono da mudança de status do orçamento. Este MCP não repete isso: não muda status, não envia, não cobra e não abre arquivo de código.

## O que a IA pode fazer

Nove ferramentas, lista fechada em `FERRAMENTAS_MCP`:

| Ferramenta | Efeito |
| --- | --- |
| `olli_listar_escopos` | Diz o que o papel pode propor. Não lê cadastro. |
| `olli_buscar` | Até 5 ids por nome ou título. Sem telefone, endereço ou CPF. Consulta só de dígitos é recusada. |
| `olli_ler` | Lê um id, só os campos do papel. |
| `olli_propor_cadastro` | Propõe cliente, produto ou serviço novo. Não grava. |
| `olli_propor_edicao` | Propõe edição de um id. |
| `olli_confirmar` | Grava se receber o token. |
| `olli_cancelar` | Desiste do rascunho ainda não gravado. |
| `olli_desfazer` | Volta a gravação, com o mesmo token, por 7 dias, se ninguém mexeu depois. |
| `olli_auditoria` | Trilha: ferramenta, resultado, nomes de campo e hashes. |

Não existe ferramenta de SQL, arquivo, shell, deploy, senha, Auth, preço de plano, envio, WhatsApp ou cobrança. Nome fora da lista responde `ferramenta_recusada` e entra na trilha. Chave de argumento como `sql`, `senha`, `cpf` ou `service_role` é recusada.

O preço publicado continua Pro R$ 39 e Empresa R$ 99. Não há campo de plano.

## Confirmação e desfazer

`olli_propor_*` devolve `rascunhoId`, os nomes dos campos e `precisaConfirmacaoHumana: true`. O token e o antes/depois ficam no canal do app (`tokenParaUsuario`, `diffParaUsuario`, `confirmarPeloUsuario`, `desfazerPeloUsuario`). A resposta JSON-RPC não leva o token nem o valor novo.

O token vale 30 minutos para confirmar e 7 dias para desfazer depois de gravado. É de uso único na confirmação: a segunda chamada não grava de novo. Sem o token, `olli_confirmar` e `olli_desfazer` respondem `confirmacao_invalida`.

A gravação compara a versão e os valores lidos na proposta. Se o registro mudou no meio, a resposta é `conflito` e nada é sobrescrito. Há no máximo 20 rascunhos abertos. A mesma `chaveIdempotencia` devolve o mesmo rascunho; corpo diferente com a mesma chave é `idempotencia_divergente`.

Desfazer um cadastro novo marca exclusão lógica. Desfazer uma edição restaura só os campos daquela proposta. Os dois falham se o registro já foi mexido outra vez.

## Papel, documento e CDC

| Papel | Escopos |
| --- | --- |
| pessoal, owner | cliente, produto, serviço, cláusula do contrato, documento |
| admin | cliente e documento |
| gestor, tecnico | cliente e, no documento, só `titulo` e `observacoes` |

Documento só é editável em `rascunho`. `pronto`, `enviado`, `assinado` e `arquivado` são leitura: a proposta volta `documento_congelado`. A casca da cláusula padrão (`id` `padrao`) só passa a existir na confirmação.

`multaAtrasoPercent` acima de 2 é `teto_cdc`. Juros acima de 10 e aviso prévio acima de 90 dias também são recusados. São os mesmos números de `contratoPdf.ts`; o teste lê os dois arquivos e falha se divergirem. O servidor não importa o gerador de PDF. Texto de cláusula é dado, não instrução: uma frase com SQL dentro do campo não cria ferramenta e não mexe em outro registro.

O e-mail do cliente não entra nesta allowlist. O campo ainda não existe no tipo `Cliente`; outro item cobre a tela.

## Auditoria e banco

Cada chamada útil gera um evento com nomes de campo e hash. Telefone e texto não vão para o evento. A sessão de teste guarda isso em memória.

`supabase/migrations/20261103180000_mcp_cadastro_auditoria.sql` descreve a mesma trilha no Postgres: RLS forçado, sem grant para `authenticated`, sem `UPDATE`, `DELETE` só passa pelo purge de 90 dias com trava. **Não aplicar nesta entrega.** O adaptador que escreveria nessa tabela ainda não existe, de propósito: ligar o Worker seria publicar superfície nova.

## O que fica para depois

Montar o processo no app do prestador, com o botão de confirmar na tela, e só então apontar a gravação para o mesmo compare-before do `iaActions.js`. Isso pede a janela de migration e não entra nesta branch. Até lá, `scripts/mcp-cadastro-stdio.ts` só responde o protocolo em memória e esquece tudo ao sair. Ele não lê ambiente e não está no `.mcp.json`.

## Rollback

Não houve deploy nem migration aplicada. Fechar o PR sem mesclar desfaz a entrega. Se a migration um dia for aplicada, pare o adaptador antes de qualquer `DROP`.
