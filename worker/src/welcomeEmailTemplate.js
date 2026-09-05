/**
 * Template local e provider-agnostic do e-mail transacional de boas-vindas.
 *
 * Renderiza HTML + texto plano depois da confirmação da conta. Não recebe
 * destinatário, não envia mensagem, não acessa rede e não escolhe remetente.
 */

import { WELCOME_TEMPLATE_VERSION } from './welcomeEvent.js';

export const WELCOME_EMAIL_RENDERER_VERSION = '2026-09-01.v1';
export const WELCOME_EMAIL_BRAND = 'OLLI Orçamentos';

const INPUT_KEYS = Object.freeze([
  'eventId',
  'template',
  'templateVersion',
  'purpose',
  'appUrl',
  'supportUrl',
  'logoUrl',
]);

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

function idSeguro(valor) {
  return typeof valor === 'string' && /^[a-zA-Z0-9._:-]{1,180}$/.test(valor) ? valor : '';
}

function urlHttps(valor, codigo) {
  exigir(typeof valor === 'string' && valor.length <= 2048, codigo);
  let url;
  try { url = new URL(valor); } catch { exigir(false, codigo); }
  exigir(url.protocol === 'https:' && !url.username && !url.password, codigo);
  return url.toString();
}

function atributoHtml(valor) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function congelarProfundo(valor) {
  if (valor === null || typeof valor !== 'object' || Object.isFrozen(valor)) return valor;
  for (const item of Object.values(valor)) congelarProfundo(item);
  return Object.freeze(valor);
}

/**
 * Renderiza um welcome estritamente transacional, sem personalização ou PII.
 */
export function renderizarEmailBoasVindas(input = {}) {
  chavesExatas(input, INPUT_KEYS, 'input_template_invalido');
  const eventId = idSeguro(input.eventId);
  exigir(eventId, 'event_id_invalido');
  exigir(input.template === 'boas_vindas', 'template_invalido');
  exigir(input.templateVersion === WELCOME_TEMPLATE_VERSION, 'template_version_divergente');
  exigir(input.purpose === 'account_onboarding', 'purpose_invalido');

  const appUrl = urlHttps(input.appUrl, 'app_url_invalida');
  const supportUrl = urlHttps(input.supportUrl, 'support_url_invalida');
  const logoUrl = urlHttps(input.logoUrl, 'logo_url_invalida');
  const appHref = atributoHtml(appUrl);
  const supportHref = atributoHtml(supportUrl);
  const logoSrc = atributoHtml(logoUrl);

  const subject = 'Bem-vindo à OLLI Orçamentos — crie seu primeiro orçamento';
  const preview = 'Sua conta está pronta. Organize seus dados e gere seu primeiro orçamento.';

  const html = `<!doctype html>
<html lang="pt-BR" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${subject}</title>
  </head>
  <body style="margin:0;background:#f2f5f7;color:#17212b;font-family:Arial,Helvetica,sans-serif;">
    <div lang="pt-BR" dir="ltr">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f2f5f7;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;">
              <tr>
                <td style="padding:32px 28px 12px;text-align:center;">
                  <img src="${logoSrc}" width="88" height="88" alt="OLLI Orçamentos" style="display:block;width:88px;height:88px;margin:0 auto;border:0;">
                </td>
              </tr>
              <tr>
                <td style="padding:8px 28px 32px;">
                  <h1 style="margin:0 0 16px;color:#17212b;font-size:26px;line-height:1.25;text-align:center;">Sua conta está pronta</h1>
                  <p style="margin:0 0 16px;color:#344454;font-size:16px;line-height:1.6;">Bem-vindo à OLLI Orçamentos. A partir de agora, você pode organizar os dados do seu serviço, montar um orçamento profissional e compartilhar o documento com seu cliente.</p>
                  <p style="margin:0 0 20px;color:#344454;font-size:16px;line-height:1.6;">Para começar:</p>
                  <ol style="margin:0 0 24px;padding-left:24px;color:#344454;font-size:16px;line-height:1.7;">
                    <li>confira os dados e a identidade da sua empresa;</li>
                    <li>cadastre o cliente e os serviços;</li>
                    <li>revise e gere seu primeiro orçamento.</li>
                  </ol>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="padding:4px 0 24px;">
                        <a href="${appHref}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 24px;border-radius:10px;background:#075f5a;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">Criar meu primeiro orçamento</a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 12px;color:#344454;font-size:16px;line-height:1.6;">Você receberá apenas avisos essenciais da conta. Lembretes educativos dependerão das preferências que você escolher na plataforma.</p>
                  <p style="margin:0;color:#344454;font-size:16px;line-height:1.6;">Precisa de ajuda? <a href="${supportHref}" style="color:#075f5a;text-decoration:underline;">Falar com o suporte da OLLI Orçamentos</a>.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 28px;border-top:1px solid #d9e1e6;color:#5d6b78;font-size:14px;line-height:1.5;text-align:center;">Este e-mail transacional foi gerado após a confirmação do seu cadastro na OLLI Orçamentos.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;

  const text = `Bem-vindo à OLLI Orçamentos

Sua conta está pronta.

Agora você pode organizar os dados do seu serviço, montar um orçamento profissional e compartilhar o documento com seu cliente.

Para começar:
1. Confira os dados e a identidade da sua empresa.
2. Cadastre o cliente e os serviços.
3. Revise e gere seu primeiro orçamento.

Criar meu primeiro orçamento: ${appUrl}

Você receberá apenas avisos essenciais da conta. Lembretes educativos dependerão das preferências escolhidas na plataforma.

Suporte da OLLI Orçamentos: ${supportUrl}

Este e-mail transacional foi gerado após a confirmação do seu cadastro.`;

  return congelarProfundo({
    rendererVersion: WELCOME_EMAIL_RENDERER_VERSION,
    template: 'boas_vindas',
    templateVersion: WELCOME_TEMPLATE_VERSION,
    purpose: 'account_onboarding',
    kind: 'transactional',
    brand: WELCOME_EMAIL_BRAND,
    locale: 'pt-BR',
    eventId,
    subject,
    preview,
    html,
    text,
  });
}

