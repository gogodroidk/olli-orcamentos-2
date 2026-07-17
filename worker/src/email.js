/**
 * E-mail transacional via Resend (prioridade 14 do plano: "B2 — Resend").
 *
 * Hoje o worker não manda NENHUM e-mail: o convite de equipe guarda o endereço do
 * convidado e o comentário do próprio código admite que é "opcional — só para
 * lembrar quem foi convidado". Quer dizer: a pessoa digita o e-mail do técnico, o
 * sistema grava, e não manda nada. O convite chega por `Share`/WhatsApp ou não chega.
 *
 * SEM SDK (mesmo critério do resto do worker, que fala com Stripe e Mercado Pago por
 * fetch puro): a API do Resend é um POST com JSON.
 *
 * DESLIGADO por padrão. Sem `RESEND_API_KEY` no cofre, tudo aqui é no-op e devolve
 * `{ ok: false, motivo: 'desligado' }` — o chamador segue a vida. Isso é o que
 * permite mergear e publicar hoje, com a chave entrando depois, sem release novo.
 *
 * REGRA DE OURO desta camada: e-mail é BEST-EFFORT e NUNCA derruba a operação. Um
 * convite cujo e-mail falhou ainda é um convite válido — o link existe, o `Share`
 * continua ali. Falhar o convite porque o SMTP de terceiro está fora seria trocar um
 * problema pequeno (não avisou) por um grande (não convidou).
 */

const RESEND_API = 'https://api.resend.com/emails';

/** Está ligado? Sem chave, o módulo é inerte. */
export function emailLigado(env) {
  return typeof env?.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.length > 0;
}

/**
 * Remetente. Vem do env para não travar o domínio no código — o Resend só entrega de
 * domínio VERIFICADO, e essa verificação é passo humano (DNS). Sem a variável, cai
 * num padrão que só funciona depois que o domínio existir; é de propósito que isso
 * seja explícito e não um chute silencioso.
 */
function remetente(env) {
  return env.RESEND_FROM || 'OLLI <nao-responda@olliorcamentos.online>';
}

function escaparHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envia UM e-mail. Nunca lança.
 * @returns {Promise<{ok: boolean, motivo?: 'desligado'|'sem_destinatario'|'falha'}>}
 */
export async function enviarEmail(env, { para, assunto, html, texto }) {
  if (!emailLigado(env)) return { ok: false, motivo: 'desligado' };
  if (!para || typeof para !== 'string') return { ok: false, motivo: 'sem_destinatario' };
  try {
    const r = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente(env),
        to: [para],
        subject: assunto,
        html,
        // Alternativa em texto: cliente de e-mail que não renderiza HTML (e vários
        // filtros de spam) tratam melhor quem manda as duas partes.
        text: texto,
      }),
    });
    if (!r.ok) {
      // Sem `throw`: quem chama é fluxo de negócio e não pode cair por causa disto.
      console.error('[olli-email] Resend recusou:', r.status, await r.text().catch(() => ''));
      return { ok: false, motivo: 'falha' };
    }
    return { ok: true };
  } catch (e) {
    console.error('[olli-email] falha de rede:', e && (e.message || e));
    return { ok: false, motivo: 'falha' };
  }
}

/**
 * Convite de equipe. O e-mail é um LEMBRETE com o link — não um segredo: o token já
 * está no link, e é ele que autoriza. Por isso o texto não promete sigilo e o link
 * expira (a coluna `expira_em` do convite).
 *
 * Sem promessa que o produto não cumpre e sem "clique aqui urgente": e-mail de
 * convite é o primeiro contato do TÉCNICO com a marca — e quem manda é o patrão dele.
 */
export async function enviarConvite(env, { para, empresa, papel, link }) {
  const nomeEmpresa = escaparHtml(empresa || 'sua empresa');
  const papelLabel = escaparHtml(papel || 'técnico');
  const url = escaparHtml(link);

  const assunto = `${empresa || 'Sua empresa'} te convidou para a equipe no OLLI`;

  const texto = [
    `${empresa || 'Sua empresa'} te convidou para entrar na equipe como ${papel || 'técnico'}.`,
    '',
    `Abra o convite: ${link}`,
    '',
    'O OLLI é o app onde a equipe recebe as ordens de serviço, registra fotos e colhe a assinatura do cliente.',
    'Se você não esperava este convite, é só ignorar — ele expira sozinho.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#F6F8FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #E6EAEF;border-radius:16px;padding:32px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0B6FCE;letter-spacing:.02em">CONVITE DE EQUIPE</p>
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0E1726">
        ${nomeEmpresa} te convidou para a equipe
      </h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4A5568">
        Você entra como <strong>${papelLabel}</strong>. No OLLI você recebe as ordens de serviço,
        registra as fotos do serviço e colhe a assinatura do cliente — tudo pelo celular, mesmo sem sinal.
      </p>
      <a href="${url}" style="display:inline-block;background:#0B6FCE;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px">
        Aceitar o convite
      </a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8A93A2">
        Se o botão não abrir, copie este endereço:<br />
        <span style="word-break:break-all;color:#4A5568">${url}</span>
      </p>
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:12px;line-height:1.6;color:#8A93A2">
      Não esperava este convite? Pode ignorar — ele expira sozinho.<br />
      Enviado pelo OLLI a pedido de ${nomeEmpresa}.
    </p>
  </div>
</body></html>`;

  return enviarEmail(env, { para, assunto, html, texto });
}
