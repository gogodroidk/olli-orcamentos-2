/**
 * Templates pt-BR dos e-mails de autenticação (Send Email Hook do Supabase).
 *
 * Mesma identidade do welcomeEmailTemplate.js: cartão branco de 600px, logo no
 * topo, verde-petróleo #075f5a no botão. Todo e-mail mostra o CÓDIGO em destaque
 * (serve em qualquer aparelho, sem abrir o link no mesmo celular) e, quando há
 * link, o botão para /auth/confirm do painel. Puro: não envia, não lê env, não
 * recebe destinatário — o endereço nunca entra no corpo.
 */

export const AUTH_EMAIL_TEMPLATE_VERSION = '2026-09-30.v1';

/**
 * Cópia por template. `botao: null` = e-mail só com código (reautenticação: o
 * Supabase confere o código no `updateUser`, não existe link para ele).
 */
const COPIAS = Object.freeze({
  auth_signup: Object.freeze({
    subject: 'Confirme seu e-mail na OLLI Orçamentos',
    preview: 'Falta só um passo para sua conta ficar pronta.',
    titulo: 'Confirme seu e-mail',
    intro: 'Falta só um passo para sua conta na OLLI Orçamentos ficar pronta.',
    botao: 'Confirmar meu e-mail',
    ignorar: 'Se você não criou uma conta na OLLI Orçamentos, ignore este e-mail.',
  }),
  auth_recovery: Object.freeze({
    subject: 'Redefina sua senha da OLLI Orçamentos',
    preview: 'Use o código ou o botão para criar uma senha nova.',
    titulo: 'Crie uma senha nova',
    intro: 'Recebemos um pedido para redefinir a senha da sua conta na OLLI Orçamentos.',
    botao: 'Criar senha nova',
    ignorar: 'Se não foi você, ignore este e-mail: sua senha atual continua valendo.',
  }),
  auth_magiclink: Object.freeze({
    subject: 'Seu código de acesso à OLLI Orçamentos',
    preview: 'Use o código ou o botão para entrar.',
    titulo: 'Seu código de acesso',
    intro: 'Use este código para entrar na sua conta da OLLI Orçamentos.',
    botao: 'Entrar na OLLI',
    ignorar: 'Se não foi você que pediu, ignore este e-mail. Ninguém entra sem este código.',
  }),
  auth_email_change_atual: Object.freeze({
    subject: 'Confirme a troca de e-mail da sua conta',
    preview: 'Recebemos um pedido para trocar o e-mail da sua conta.',
    titulo: 'Confirme a troca de e-mail',
    intro: 'Recebemos um pedido para trocar o e-mail da sua conta na OLLI Orçamentos por outro endereço.',
    botao: 'Confirmar a troca',
    ignorar: 'Se não foi você, não confirme e troque sua senha no app.',
  }),
  auth_email_change_novo: Object.freeze({
    subject: 'Confirme seu novo e-mail na OLLI Orçamentos',
    preview: 'Confirme este endereço como o novo e-mail da sua conta.',
    titulo: 'Confirme seu novo e-mail',
    intro: 'Este endereço foi informado como o novo e-mail de uma conta na OLLI Orçamentos.',
    botao: 'Confirmar novo e-mail',
    ignorar: 'Se você não pediu esta troca, ignore este e-mail.',
  }),
  auth_invite: Object.freeze({
    subject: 'Você foi convidado para a OLLI Orçamentos',
    preview: 'Aceite o convite para criar seu acesso.',
    titulo: 'Você foi convidado',
    intro: 'Você recebeu um convite para usar a OLLI Orçamentos.',
    botao: 'Aceitar convite',
    ignorar: 'Se você não esperava este convite, ignore este e-mail.',
  }),
  auth_reauthentication: Object.freeze({
    subject: 'Código para confirmar que é você',
    preview: 'Digite este código no app para concluir a ação.',
    titulo: 'Confirme que é você',
    intro: 'Para concluir uma ação protegida na sua conta da OLLI Orçamentos, digite este código no app.',
    botao: null,
    ignorar: 'Se não foi você, troque sua senha no app.',
  }),
});

export const AUTH_EMAIL_TEMPLATES = Object.freeze(Object.keys(COPIAS));

const INPUT_KEYS = Object.freeze(['template', 'codigo', 'link', 'validadeMinutos', 'logoUrl', 'supportUrl']);

function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function chavesExatas(valor, esperadas, codigo) {
  exigir(valor !== null && typeof valor === 'object' && !Array.isArray(valor), codigo);
  const recebidas = Object.keys(valor).sort();
  const lista = [...esperadas].sort();
  exigir(recebidas.length === lista.length && recebidas.every((chave, indice) => chave === lista[indice]), codigo);
}

function urlHttps(valor, codigo) {
  exigir(typeof valor === 'string' && valor.length <= 2048, codigo);
  let url;
  try { url = new URL(valor); } catch { exigir(false, codigo); }
  exigir(url.protocol === 'https:' && !url.username && !url.password, codigo);
  return url.toString();
}

function escaparHtml(valor) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function frasesValidade(minutos, comLink) {
  const unidade = minutos === 1 ? 'minuto' : 'minutos';
  return comLink
    ? `O código e o botão valem por ${minutos} ${unidade} e só funcionam uma vez.`
    : `O código vale por ${minutos} ${unidade} e só funciona uma vez.`;
}

/**
 * Renderiza assunto, prévia, HTML e texto. Lança com `codigo` em entrada fora do
 * contrato — quem chama transforma isso em erro do hook, nunca em e-mail torto.
 */
export function renderizarEmailAuth(input = {}) {
  chavesExatas(input, INPUT_KEYS, 'input_template_invalido');
  const copia = COPIAS[input.template];
  exigir(copia, 'template_invalido');
  exigir(typeof input.codigo === 'string' && /^\d{6,10}$/.test(input.codigo), 'codigo_invalido');
  exigir(Number.isInteger(input.validadeMinutos) && input.validadeMinutos >= 1 && input.validadeMinutos <= 1440, 'validade_invalida');
  const comLink = copia.botao !== null;
  exigir(comLink ? typeof input.link === 'string' : input.link === null, 'link_invalido');
  const link = comLink ? urlHttps(input.link, 'link_invalido') : null;
  const logoUrl = urlHttps(input.logoUrl, 'logo_url_invalida');
  const supportUrl = urlHttps(input.supportUrl, 'support_url_invalida');

  const codigo = input.codigo;
  const validade = frasesValidade(input.validadeMinutos, comLink);
  const instrucao = comLink
    ? 'Toque no botão ou digite este código no app — funciona em qualquer aparelho:'
    : 'Seu código:';

  const blocoBotao = comLink
    ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="padding:4px 0 20px;">
                        <a href="${escaparHtml(link)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 24px;border-radius:10px;background:#075f5a;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${copia.botao}</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 16px;color:#5d6b78;font-size:13px;line-height:1.5;word-break:break-all;">Se o botão não abrir, copie este endereço no navegador:<br><a href="${escaparHtml(link)}" style="color:#075f5a;">${escaparHtml(link)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="pt-BR" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${copia.subject}</title>
  </head>
  <body style="margin:0;background:#f2f5f7;color:#17212b;font-family:Arial,Helvetica,sans-serif;">
    <div lang="pt-BR" dir="ltr">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${copia.preview}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f2f5f7;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;">
              <tr>
                <td style="padding:32px 28px 8px;text-align:center;">
                  <img src="${escaparHtml(logoUrl)}" width="64" height="64" alt="OLLI Orçamentos" style="display:block;width:64px;height:64px;margin:0 auto;border:0;">
                </td>
              </tr>
              <tr>
                <td style="padding:8px 28px 28px;">
                  <h1 style="margin:0 0 12px;color:#17212b;font-size:24px;line-height:1.25;text-align:center;">${copia.titulo}</h1>
                  <p style="margin:0 0 16px;color:#344454;font-size:16px;line-height:1.6;text-align:center;">${copia.intro}</p>
                  <p style="margin:0 0 8px;color:#344454;font-size:15px;line-height:1.5;text-align:center;">${instrucao}</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="padding:4px 0 8px;">
                        <div style="display:inline-block;padding:14px 22px;border-radius:12px;background:#e8f3f2;border:1px solid #b9dcd9;color:#075f5a;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;line-height:1.1;">${codigo}</div>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 20px;color:#5d6b78;font-size:14px;line-height:1.5;text-align:center;">${validade}</p>${blocoBotao}
                  <p style="margin:0;color:#344454;font-size:14px;line-height:1.6;">${copia.ignorar} Nunca passe este código para ninguém — a equipe da OLLI não pede código.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 28px;border-top:1px solid #d9e1e6;color:#5d6b78;font-size:13px;line-height:1.5;text-align:center;">E-mail automático de segurança da OLLI Orçamentos. Dúvidas? <a href="${escaparHtml(supportUrl)}" style="color:#075f5a;text-decoration:underline;">Fale com o suporte</a>.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;

  const text = [
    copia.titulo,
    '',
    copia.intro,
    '',
    `${instrucao} ${codigo}`,
    validade,
    ...(comLink ? ['', `${copia.botao}: ${link}`] : []),
    '',
    `${copia.ignorar} Nunca passe este código para ninguém — a equipe da OLLI não pede código.`,
    '',
    `Suporte da OLLI Orçamentos: ${supportUrl}`,
  ].join('\n');

  return Object.freeze({
    template: input.template,
    templateVersion: AUTH_EMAIL_TEMPLATE_VERSION,
    subject: copia.subject,
    preview: copia.preview,
    html,
    text,
  });
}
