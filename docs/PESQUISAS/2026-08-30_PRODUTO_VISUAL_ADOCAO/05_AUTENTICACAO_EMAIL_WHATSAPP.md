# Autenticação, recuperação por e-mail e WhatsApp

## Veredito atual

| Superfície | Estado observado | O que ainda não está provado |
|---|---|---|
| Dashboard web | fluxo implementado: solicita reset com redirect, rota `/nova-senha`, espera sessão de recuperação e atualiza senha | entrega real do e-mail, URLs permitidas, expiração e aceite em ambiente publicado |
| App mobile | botão chama `resetPasswordForEmail` e usa mensagem sem enumeração | não há redirect/deep link específico de recuperação nem tela nativa observada para definir nova senha |
| E-mail transacional de equipe | Worker possui envio best-effort via Resend | fica inerte sem `RESEND_API_KEY`; domínio/remetente/entrega de produção não foram validados |
| EmailProvider do app | contrato/porta documentado | implementação efetiva no app ainda é declarada ausente; fallback atual é mailto/WhatsApp |
| WhatsApp operacional | muitos deep links `wa.me`/`whatsapp://` para compartilhar/falar | isso não é WhatsApp Business API, não prova envio e não serve como OTP |
| OTP | componente visual existe no dashboard e telefone é normalizado no app | componente instalado não equivale a fluxo de recuperação; SMS/WhatsApp OTP continuam pendentes |

## Evidência local

- `src/screens/EntrarScreen.tsx` chama `supabase.auth.resetPasswordForEmail(e)` sem `redirectTo`.
- `src/navigation/linking.ts` não declara rota de recuperação de senha.
- `src/services/supabase.ts` usa PKCE e troca manual de code para OAuth nativo; o comentário de telefone diz que OTP por SMS é pendência humana.
- `webapp/src/pages/sys/login/reset-form.tsx` usa `redirectTo: ${window.location.origin}/nova-senha`.
- `webapp/src/pages/sys/login/nova-senha.tsx` trata sessão, evento `PASSWORD_RECOVERY`, link inválido/expirado e `updateUser({ password })`.
- `worker/src/email.js` envia via Resend somente com variáveis de ambiente e atualmente atende convite de equipe.
- `src/services/ports/EmailProvider.ts` declara que o envio transacional no app ainda não existe.
- `webapp/src/ui/input-otp.tsx` e `input-otp` são infraestrutura visual; não provam um serviço OTP ativo.

## P0 recomendado — recuperação por e-mail ponta a ponta

1. Definir deep link nativo, por exemplo `olliorcamentos://auth/recovery`.
2. Enviar `redirectTo` correto por plataforma.
3. Capturar o retorno nativo e trocar code por sessão de recuperação.
4. Criar tela nativa `Defina sua nova senha` com mostrar senha, autofill, validação e confirmação.
5. Tratar link expirado, usado, inválido e dispositivo sem app.
6. Usar mensagem genérica para não revelar se o e-mail existe.
7. Mostrar `Seus dados não foram apagados; você está apenas recuperando o acesso`.
8. Oferecer suporte visível sem obrigar o usuário a abandonar o fluxo.
9. Testar web, Android físico, app fechado, app aberto, link expirado e pedido repetido.
10. Validar URLs de redirect, SMTP/provider, domínio, SPF/DKIM/DMARC e entregabilidade no ambiente correto.

Fonte oficial: [Supabase — Password-based Auth](https://supabase.com/docs/guides/auth/passwords).

## E-mail transacional

Separar dois sistemas:

- Supabase Auth: confirmação e recuperação de acesso;
- provider transacional, como Resend: orçamento, recibo, boas-vindas e convite.

Regras:

- chave somente no servidor/Worker;
- templates versionados e testados em texto/HTML;
- link com validade e propósito claro;
- logs sem expor conteúdo sensível;
- retentativa controlada/idempotente;
- status `enviado` somente após confirmação do provider;
- fallback por compartilhamento manual quando provider estiver indisponível;
- DNS, domínio e produção permanecem gate humano.

## WhatsApp: recomendação por fases

### Agora

- compartilhamento iniciado pelo usuário;
- suporte e vendas via deep link;
- mensagens prontas revisáveis;
- nunca declarar `enviado` apenas porque o WhatsApp foi aberto.

### Depois

Avaliar WhatsApp OTP apenas via plataforma oficial, template de autenticação aprovado e número verificado. Antes de implementar, decidir:

- vínculo confiável entre conta e telefone;
- consentimento e política de privacidade;
- prevenção de abuso, rate limit e bloqueio de enumeração;
- custo por conversa/template;
- fallback por e-mail;
- troca/perda de número;
- autofill/colar código;
- recuperação humana;
- métricas e auditoria;
- aprovação Meta e qualidade do template.

Referência oficial de template de autenticação: [Meta WhatsApp Business Platform — authentication template](https://www.postman.com/meta/whatsapp-business-platform/request/mkopcjr/create-authentication-template-w-otp-one-tap-autofill-button).

## Não fazer

- usar automação não oficial de WhatsApp para código de acesso;
- enviar OTP pelo cliente/app com segredo embutido;
- tratar número digitado no cadastro como já verificado;
- bloquear colagem/autofill;
- dizer que o e-mail foi entregue quando apenas a requisição foi aceita;
- tornar WhatsApp a única recuperação;
- configurar DNS/chaves/produção sem autorização.

## Critérios de aceite futuros

- recuperação completa em web e Android físico;
- link expirado gera saída clara e novo pedido;
- nenhum dado é perdido;
- nenhuma enumeração de conta;
- botão não dispara pedidos duplicados;
- e-mail real chega no ambiente de aceite, inclusive teste de spam;
- código/OTP permite autofill e colagem;
- ajuda não encobre o formulário;
- logs não guardam senha, token ou código.
