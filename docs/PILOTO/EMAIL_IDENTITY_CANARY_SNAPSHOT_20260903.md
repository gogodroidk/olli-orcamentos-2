# Snapshot pré-canário de identidade de e-mail — OLLI Orçamentos

- Capturado em: `2026-09-03T04:25:57-03:00` (antes de qualquer escrita DNS)
- Conta Cloudflare: `Igoreluisa@gmail.com` (sessão já aberta)
- Zona confirmada: `olliorcamentos.online`
- Zona ID: `d7489b5e802e1cf92c0ea1a725f4e22d`
- Conta Resend: `igoreluisa@gmail.com`
- Domínio Resend criado para este canário: `olliorcamentos.online`
- ID do domínio Resend: `00b4c058-d27f-48a6-93ce-830c77110e3f`

## Estado DNS relevante antes do canário

Consulta somente leitura pela tela DNS do Cloudflare; havia 15 registros na zona.

| Nome | Tipo | Conteúdo | TTL/Prioridade | Ação de rollback |
|---|---|---|---|---|
| `olliorcamentos.online` | MX | `mx2.hostinger.com` | 14400 s / 10 | preservar |
| `olliorcamentos.online` | MX | `mx1.hostinger.com` | 14400 s / 5 | preservar |
| `_dmarc.olliorcamentos.online` | TXT | `v=DMARC1; p=none` | 3600 s | preservar/alterar somente se explicitamente decidido |
| `hostingermail-a._domainkey.olliorcamentos.online` | CNAME | `hostingermail-a.dkim.mail.hostinger.com` | 3600 s | preservar |
| `hostingermail-b._domainkey.olliorcamentos.online` | CNAME | `hostingermail-b.dkim.mail.hostinger.com` | 3600 s | preservar |
| `hostingermail-c._domainkey.olliorcamentos.online` | CNAME | `hostingermail-c.dkim.mail.hostinger.com` | 3600 s | preservar |
| `olliorcamentos.online` (raiz) | TXT SPF | **não localizado na listagem** | — | nenhuma remoção |
| `resend._domainkey.olliorcamentos.online` | TXT DKIM | **não localizado na listagem** | — | nenhum registro anterior |
| `send.olliorcamentos.online` | MX/TXT | **não localizado na listagem** | — | nenhum registro anterior |

## Limites da evidência

- A API tokenizada do Cloudflare retornou HTTP 403 de autenticação por escopo DNS; a confirmação acima veio da sessão do painel e não deve ser confundida com cota.
- O snapshot não contém token, senha, sessão, destinatário ou dado de cliente.
- Rollback do canário: remover somente os registros criados para `resend._domainkey`, `send` e eventual MX de recebimento; não tocar nos registros Hostinger existentes.

## Resultado verificado após a escrita limitada

- Verificado em: `2026-09-03T04:42:28-03:00`.
- Resend exibiu `olliorcamentos.online` como **Verified**, região `São Paulo (sa-east-1)`; DKIM, SPF e MX aparecem no painel do domínio.
- Cloudflare exibiu 18 registros (15 anteriores + 3 canários): DKIM TXT `resend._domainkey`, SPF TXT `send` e MX `send` com prioridade 10; todos `DNS only`.
- Resolvedores públicos `1.1.1.1`, `8.8.8.8` e `9.9.9.9` retornaram o TXT SPF e o MX `feedback-smtp.sa-east-1.amazonses.com`.
- Não houve envio de e-mail, criação/rotação de chave, binding de secret, migration, cobrança ou deploy. O Worker `olli-orcamentos` no painel não possui versão/deployment nem bindings; por isso o canário de entrega foi encerrado como gate humano pendente.

## Revalidação do alvo correto do Worker (somente leitura)

- Revalidado em: `2026-09-03T04:54:54-03:00`–`2026-09-03T05:01:00-03:00`.
- O código canônico e o painel convergem para o serviço `olli-diagnostico`; o painel semelhante `olli-orcamentos` não é o alvo desta aplicação.
- `olli-diagnostico` possui deployment ativo `8146a2d0`, com `100%` do tráfego e `243` versões no histórico; a leitura não alterou tráfego nem versão.
- Domínios/rotas visíveis no painel: `link.olliorcamentos.online` e `diagnostico.olliorcamentos.online`, ambos em `Production`, zona `olliorcamentos.online`.
- Bindings visíveis: Workers AI (`AI`) e rate limiters (`ADMIN_RL`, `CEP_RL`, `CNPJ_RL`, `ETA_RL`, `IA_RL`, `LINK_RL`, `MPHOOK_RL`, `MP_RL`, `STRIPE_RL`, `TRANSCREVER_RL`). Nenhum binding de e-mail/Resend apareceu na leitura.
- A tela de variáveis/segredos mostra apenas valores criptografados; `RESEND_API_KEY` não apareceu no texto visível. Nenhum valor foi aberto, copiado ou alterado.
- Resultado operacional: o alvo correto está identificado, mas o canário de entrega continua bloqueado até o secret ser colocado no Worker correto pelo cofre oficial e existir um destinatário de teste explicitamente confirmado. Nenhum e-mail foi enviado.

## Resultado do canário técnico autorizado — 2026-09-04

- Executado em: `2026-09-04T11:45:49-03:00`–`2026-09-04T11:52:52-03:00`.
- Resend criou uma credencial nova com permissão **Sending access** e escopo somente do
  domínio `olliorcamentos.online`; o valor não foi exibido, gravado em arquivo ou incluído
  em logs/ledger.
- O painel do Worker `olli-diagnostico` confirmou `RESEND_API_KEY` como variável do tipo
  Secret, com **Value encrypted**. O serviço vazio `olli-orcamentos` não foi tocado.
- Um único envio de teste foi feito para o simulador oficial `delivered@resend.dev`, com
  remetente `OLLI Orçamentos <nao-responda@olliorcamentos.online>`. A API respondeu HTTP
  200 e a listagem de Emails do Resend exibiu **Delivered**.
- A tentativa de ler detalhes pela mesma credencial retornou HTTP 401, esperado para uma
  chave de envio sem permissão de leitura; nenhuma chave de acesso total foi usada.
- Evidência continua limitada a teste controlado do provider: `acceptedReal=false`. Ainda
  não há persistência transacional do evento real, rollout para usuários, notificações
  reais, billing, consultas administrativas de dados ou release PWA/APK.
