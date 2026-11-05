# Painel admin OLLI (diagnostico.olliorcamentos.online/admin)

Painel interno do dono e da equipe (não é o painel do prestador). Servido pelo Worker
`olli-diagnostico`. Sem framework: HTML/CSS/JS gerados em `worker/src/adminPagina.js`.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `worker/src/admin.js` | roteador `/admin/api/*`, `requireAdmin`, gates de papel/AAL, leituras (métricas, usuários, ficha) e ações antigas (plano, bloqueio, exclusão, funil, admins) |
| `worker/src/adminSessao.js` | sessão por cookie HttpOnly + aparelho confiável |
| `worker/src/adminFerramentas.js` | créditos, desconectar aparelhos, confirmar e-mail, código de acesso, notas, CNPJ, registro de export |
| `worker/src/adminOperacao.js` | busca, churn, conversão por plano, lote e CSV de orçamentos (puro, sem rede) |
| `worker/src/adminPagina.js` | a página inteira |
| `worker/scripts/teste-admin-operacao.js` | testes da operação nova |
| `worker/src/adminDataPolicy.js` | o que cada papel enxerga na ficha (inclui `notas`) |
| `supabase/migrations/20261005100000_admin_dispositivos_confiaveis.sql` | tabela `admin_trusted_devices` + função `admin_revogar_sessoes` |
| `scripts/teste-admin-sessao.ts` | testes da sessão, aparelho confiável e créditos |

## Login: código do autenticador só em aparelho novo

1. **Sessão persistente.** O refresh token do Supabase fica no cookie `__Secure-olli_adm_s`
   (HttpOnly, Secure, SameSite=Strict, Path=/admin, 30 dias renovados a cada uso). A página guarda
   o access token só em memória e renova sozinha (`POST /admin/api/sessao/renovar`). O Supabase
   mantém o AAL2 da sessão no refresh: confirmou o código uma vez, segue verificado.
2. **Aparelho lembrado.** Ao confirmar o código com "Lembrar este aparelho" marcado, o Worker grava
   o sha-256 de um token aleatório em `admin_trusted_devices` e põe o token no cookie
   `__Secure-olli_adm_d` (30 dias, sem renovação). Se a sessão acabar, a senha basta nesse aparelho.
   Aparelho novo pede o código.
3. **Falha fechado.** Tabela fora do ar ou cookie inválido = pede o código.
4. **Exceções.** Excluir conta e mexer em administradores exigem o código **desta** sessão
   (`mfaReal`), não aceitam só o aparelho.
5. Trocar a senha esquece os outros aparelhos. Segurança → "Sair e esquecer este aparelho" para
   computador emprestado.

## Ferramentas por conta (todas com motivo + auditoria)

| Ação | Papel mínimo | Observação |
|---|---|---|
| Adicionar / remover créditos de IA | financeiro | lançamento `ajuste` no livro-razão; idempotente por `requestId`; saldo nunca negativo; até 5.000 por vez |
| Liberar Pro/Empresa por N dias, revogar | financeiro | RPC `admin_set_plano_override` (já existia) |
| Redefinir senha (e-mail) | suporte | |
| Código de acesso por e-mail | suporte | o admin não vê o código, não é personificação |
| Confirmar e-mail | suporte | |
| Desconectar de todos os aparelhos | suporte | apaga `auth.sessions`; access já emitido vale até 1 h |
| Bloquear 1/7/30/90 dias ou até desbloquear | suporte | |
| Nota interna | suporte | linha `nota_interna` na trilha (não edita, não apaga) |
| Consultar CNPJ | suporte | BrasilAPI → OpenCNPJ; sem sócios |
| Relatório TXT, exportar CSV, funil | admin | export é auditado antes do download |
| Busca Ctrl+K (contas e orçamentos) | admin + AAL2 | `GET /admin/api/busca` |
| Lista de orçamentos com filtro e CSV | admin + AAL2 | `GET /admin/api/orcamentos`; CSV reusa o registro de export |
| Bloquear, desbloquear ou nota em lote (até 25, com motivo) | o mesmo da ação individual | `POST /admin/api/users/lote`; não exclui, não mexe em crédito nem plano |
| Excluir conta | owner + código desta sessão | cancela Stripe/MP/Play, apaga arquivos |

## O que fica DESLIGADO de propósito

- **CPF → nome / situação**: não existe API grátis e legal (sigilo fiscal + LGPD). Só Serpro
  Datavalid/Consulta CPF ou revendedores, pagos e com contrato. CPF também está fora da política de
  dados do painel.
- **Busca de pessoas (nome/telefone/e-mail) por data broker** (BigDataCorp, Assertiva, Neoway,
  Serasa): pago e exige LIA/RIPD e aviso na política de privacidade. "Painéis de consulta" grátis
  usam base vazada = ilegal.
- **Personificação ("entrar como o usuário")**: fora até haver modo só-leitura com faixa visível e
  prazo curto.

## Operação no painel (sem migração)

- **Saíram em 30 dias:** cliente, plano pro/empresa na linha, status de saída, período encerrado na janela e gateway real (Stripe, Pix ou Play). Cortesia, demo e conta interna ficam de fora. Leitura falha = indisponível, nunca zero.
- **Viraram pagantes:** contas de clientes com pagamento ativo agora, e a taxa de quem já fez o 1º orçamento em cada plano.
- **Filtros salvos** ficam só neste navegador (`localStorage`), no máximo 8. Não há tabela nova.
- **Lote** reusa bloqueio e nota. A trilha ganha uma linha `usuarios_acao_lote` com a contagem, além da linha de cada conta.

## Ideias para a próxima leva

- Mandar e-mail em lote (ex.: "nunca orçaram"). O lote de bloqueio e nota já existe.
- Validação de telefone (libphonenumber-js) e e-mail descartável (lista open-source local).
- Cache de CNPJ no KV para a consulta do painel.
- Gráfico de cadastros/ativação por semana na visão geral.
