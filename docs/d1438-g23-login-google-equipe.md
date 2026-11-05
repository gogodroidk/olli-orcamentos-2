# D1438-G23 — funcionário entra com o Google do e-mail do convite

Spec do item do áudio de 27/10 (Equipe / Login). Código nesta branch. Config de Auth em produção não muda.

## O que o Igor pediu

A pessoa convidada entra com o Google a partir do e-mail que recebeu o convite.

## Como fica

1. Quem convida pode informar o e-mail. Sem e-mail, o link continua valendo para quem receber (WhatsApp ou outro canal).
2. Com e-mail, o OLLI manda o convite para esse endereço. A página do link explica que a entrada é com o Google dessa conta e mostra o endereço mascarado (primeira letra e domínio).
3. O botão abre o painel em `/auth/login?convite=<token>`. O retorno do Google continua sendo exatamente `/auth/login`, sem query, para não depender de endereço novo na allowlist do Auth.
4. O Google recebe só `login_hint` (o e-mail do convite) e `prompt=select_account`. Não há escopo de Gmail, Drive ou contatos.
5. Depois do login, a pessoa confirma em `/equipe/aceitar` ou na tela de convite do app. Abrir o link não entra na equipe sozinho.
6. O banco (`aceitar_convite`) recusa outra conta (`erro:convite_outro_email`) e recusa sessão sem Google (`erro:convite_exige_google`) quando o convite tem e-mail. O app lê esse texto. Antes, o PostgREST devolvia o texto como sucesso.

## O que esta branch não faz

- Não altera provider, redirect URL, linking nem nenhum botão do painel do Supabase Auth.
- Não aplica a migration. O arquivo está em `supabase/migrations/20261103120000_convite_equipe_google.sql`.
- Não publica worker, painel, app nem DNS.
- Não envia e-mail, WhatsApp nem mensagem a cliente.

## Próximo passo, quando houver janela

1. Revisar o PR.
2. Aplicar a migration na janela combinada.
3. Publicar o worker (página e `GET /equipe/convite/<token>/resumo`) e o painel juntos, para o botão e a checagem do banco nascerem no mesmo dia.
4. Conferir com um convite de teste: e-mail certo entra; outra conta Google vê a recusa e não vira membro.
