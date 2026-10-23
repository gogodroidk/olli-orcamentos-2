/**
 * Templates dos LEMBRETES por e-mail (ativação e assinatura).
 *
 * Mesma linha do `welcomeEmailTemplate.js`: HTML de tabela + texto simples,
 * curtos, com a marca, sem nome/e-mail da pessoa, sem rede e sem segredo. Todo
 * lembrete leva o link "Parar de receber lembretes" (e o consumer põe o mesmo
 * link no cabeçalho List-Unsubscribe).
 *
 * Copy DERIVADA da fonte, nunca de memória (memória "copy derivada da fonte"):
 * as frases de cobrança repetem as da regra `src/services/lembreteAssinatura.ts`
 * que a faixa do app já mostra. Nada de urgência inventada, desconto ou prazo
 * falso. Desde 01/10/2026 (Grátis ilimitado) só a renovação vira e-mail.
 */

import { LEMBRETE_ASSINATURA, LEMBRETE_ATIVACAO, LEMBRETE_REENGAJAMENTO } from './emailLembretesPolicy.js';
import { PRECO_PRO, reais } from '../../src/services/precosPlanos.ts';
import { FRASE_GRATIS, frasePro } from '../../src/services/planosBase.ts';

export const EMAIL_LEMBRETES_RENDERER_VERSION = '2026-10-05.v3';
export const EMAIL_LEMBRETES_BRAND = 'OLLI Orçamentos';

const INPUT_KEYS = Object.freeze([
  'eventId',
  'template',
  'templateVersion',
  'purpose',
  'dados',
  'appUrl',
  'supportUrl',
  'logoUrl',
  'unsubscribeUrl',
]);
const JANELAS = new Set(['activation_day_3', 'activation_day_7']);
const NOME_PLANO = Object.freeze({ pro: 'Pro', empresa: 'Empresa' });
const DIAS_SEMANA = Object.freeze(['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']);
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;

export function exigir(condicao, codigo) {
  if (!condicao) {
    const erro = new Error(codigo);
    erro.codigo = codigo;
    throw erro;
  }
}

function objeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function chavesExatas(valor, esperadas, codigo) {
  exigir(objeto(valor), codigo);
  const recebidas = Object.keys(valor).sort();
  const lista = [...esperadas].sort();
  exigir(recebidas.length === lista.length && recebidas.every((chave, i) => chave === lista[i]), codigo);
}

export function idSeguro(valor) {
  return typeof valor === 'string' && /^[a-zA-Z0-9._:-]{1,240}$/.test(valor) ? valor : '';
}

export function urlHttps(valor, codigo) {
  exigir(typeof valor === 'string' && valor.length <= 2048, codigo);
  let url;
  try { url = new URL(valor); } catch { exigir(false, codigo); }
  exigir(url.protocol === 'https:' && !url.username && !url.password, codigo);
  return url;
}

export function atributoHtml(valor) {
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function htmlTexto(valor) {
  return String(valor).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function congelarProfundo(valor) {
  if (valor === null || typeof valor !== 'object' || Object.isFrozen(valor)) return valor;
  for (const item of Object.values(valor)) congelarProfundo(item);
  return Object.freeze(valor);
}

function inteiroEntre(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

/** "02/10 (quinta)" no relógio de Brasília. */
export function dataCurtaBrasilia(iso) {
  const d = new Date(iso);
  exigir(!Number.isNaN(d.getTime()), 'data_invalida');
  const b = new Date(d.getTime() + OFFSET_BRASILIA_MS);
  const dia = String(b.getUTCDate()).padStart(2, '0');
  const mes = String(b.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes} (${DIAS_SEMANA[b.getUTCDay()]})`;
}

export function urlCom(base, caminho, params = {}) {
  const url = new URL(base.toString());
  url.pathname = caminho;
  url.search = '';
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

// ─── Conteúdo por tipo ───────────────────────────────────────────────────────

function conteudoAtivacao(dados, appUrl) {
  chavesExatas(dados, ['janela'], 'dados_invalidos');
  exigir(JANELAS.has(dados.janela), 'janela_invalida');
  const cta = { rotulo: 'Criar meu primeiro orçamento', href: urlCom(appUrl, '/') };
  const passos = [
    'cadastre o cliente;',
    'adicione os serviços e os valores;',
    'gere o orçamento e envie ao cliente.',
  ];
  if (dados.janela === 'activation_day_3') {
    return {
      subject: 'Seu primeiro orçamento na OLLI Orçamentos',
      preview: 'Sua conta está pronta. Falta só o primeiro orçamento.',
      titulo: 'Vamos fazer o primeiro orçamento?',
      paragrafos: ['Sua conta na OLLI Orçamentos está pronta, mas ainda não tem nenhum orçamento. Dá para começar agora:'],
      passos,
      cta,
      depois: ['Se travou em alguma parte, responda este e-mail ou fale com o suporte.'],
      motivo: 'Você recebe este lembrete porque criou uma conta na OLLI Orçamentos e ainda não fez nenhum orçamento.',
    };
  }
  return {
    subject: 'Seu primeiro orçamento continua esperando',
    preview: 'Seus dados estão salvos. O primeiro orçamento está a um clique.',
    titulo: 'Seu primeiro orçamento continua esperando',
    paragrafos: [
      'Faz uma semana que você criou sua conta na OLLI Orçamentos e ainda não montou nenhum orçamento.',
      'No plano Grátis você já consegue enviar orçamentos, sem cartão. Seus dados continuam salvos.',
    ],
    passos,
    cta,
    depois: ['Este é o último lembrete deste tipo. Se precisar de ajuda, responda este e-mail.'],
    motivo: 'Você recebe este lembrete porque criou uma conta na OLLI Orçamentos e ainda não fez nenhum orçamento.',
  };
}

function conteudoAssinatura(dados, appUrl) {
  exigir(objeto(dados) && typeof dados.tipo === 'string', 'dados_invalidos');
  const motivo = 'Você recebe este aviso porque tem uma conta na OLLI Orçamentos.';
  const renovar = { rotulo: 'Renovar com Pix', href: urlCom(appUrl, '/planos', { renovar: 'pix' }) };

  // Grátis ILIMITADO desde 01/10/2026: os avisos de cota (cota_quase/cota_esgotada)
  // não existem mais. Um pedido desses que ainda esteja na fila (enfileirado antes
  // do deploy) NÃO pode sair dizendo "você usou os 5 orçamentos" — falha com um
  // código próprio e o consumer o descarta (dead_letter), em vez de mentir.
  exigir(dados.tipo !== 'cota_quase' && dados.tipo !== 'cota_esgotada', 'tipo_descontinuado');

  if (dados.tipo === 'renovar_pix' || dados.tipo === 'plano_vencido') {
    chavesExatas(dados, ['tipo', 'plano', 'venceEm', 'momento', 'sequencia'], 'dados_invalidos');
    exigir(Object.hasOwn(NOME_PLANO, dados.plano), 'dados_invalidos');
    const vence = new Date(dados.venceEm);
    exigir(!Number.isNaN(vence.getTime()) && vence.toISOString() === dados.venceEm, 'dados_invalidos');
    exigir(dados.sequencia === `renovacao:${dados.venceEm}`, 'dados_invalidos');
    const nome = NOME_PLANO[dados.plano];
    const quando = dataCurtaBrasilia(dados.venceEm);

    if (dados.tipo === 'renovar_pix') {
      exigir(dados.momento === 'D-3' || dados.momento === 'D0', 'dados_invalidos');
      const titulo = `Seu plano ${nome} vence em ${quando}`;
      return {
        subject: titulo,
        preview: 'O Pix não renova sozinho. Renove para não perder o acesso.',
        titulo,
        paragrafos: [
          'O Pix não renova sozinho. Renove agora para não perder o acesso — os dias que faltam não se perdem.',
        ],
        passos: null,
        cta: renovar,
        depois: ['Se você já renovou, pode ignorar este aviso.'],
        motivo,
      };
    }

    exigir(dados.momento === 'D1', 'dados_invalidos');
    const titulo = `Seu plano ${nome} venceu`;
    return {
      subject: `${titulo} — seus dados continuam salvos`,
      preview: 'Você voltou ao Grátis. Renove com Pix para liberar tudo de novo.',
      titulo,
      paragrafos: [
        `Seu plano ${nome} venceu em ${quando} e a conta voltou ao plano Grátis — seus dados continuam salvos.`,
        'Renove com Pix para liberar tudo de novo.',
      ],
      passos: null,
      cta: renovar,
      depois: ['Se você já renovou, pode ignorar este aviso.'],
      motivo,
    };
  }

  exigir(false, 'tipo_invalido');
  return null;
}

// Copy da régua de reengajamento. Preço e benefícios vêm da MESMA fonte das
// telas: `PRECO_PRO` (precosPlanos.ts), `frasePro()` e `FRASE_GRATIS`
// (planosBase.ts). "Não cobra nada e não renova sozinho" e "dados continuam
// salvos" repetem o que `iniciar_trial_pro()` grava: requires_card=false,
// auto_renews=false, data_disposition='preserve'.
function conteudoReengajamento(dados, appUrl) {
  exigir(objeto(dados) && typeof dados.tipo === 'string', 'dados_invalidos');
  const novoOrcamento = { rotulo: 'Fazer um orçamento', href: urlCom(appUrl, '/') };

  if (dados.tipo === 'ativacao_ultima') {
    chavesExatas(dados, ['tipo'], 'dados_invalidos');
    return {
      subject: 'Sua conta na OLLI Orçamentos continua aqui',
      preview: 'No plano Grátis os orçamentos são ilimitados, sem cartão.',
      titulo: 'Sua conta continua aqui',
      paragrafos: [
        'Você criou sua conta na OLLI Orçamentos há mais de um mês e ainda não fez nenhum orçamento.',
        `No plano Grátis você tem ${FRASE_GRATIS}. Não precisa de cartão.`,
      ],
      passos: null,
      cta: { rotulo: 'Criar meu primeiro orçamento', href: urlCom(appUrl, '/') },
      depois: ['Este é o último lembrete deste tipo. Se travou em alguma parte, responda este e-mail ou fale com o suporte.'],
      motivo: 'Você recebe este lembrete porque criou uma conta na OLLI Orçamentos e ainda não fez nenhum orçamento.',
    };
  }

  if (dados.tipo === 'parou') {
    chavesExatas(dados, ['tipo', 'etapa', 'ultimoOrcamentoEm'], 'dados_invalidos');
    exigir(dados.etapa === 'd7' || dados.etapa === 'd14', 'dados_invalidos');
    const ultimo = new Date(dados.ultimoOrcamentoEm);
    exigir(!Number.isNaN(ultimo.getTime()) && ultimo.toISOString() === dados.ultimoOrcamentoEm, 'dados_invalidos');
    const quando = dataCurtaBrasilia(dados.ultimoOrcamentoEm);
    const motivo = 'Você recebe este lembrete porque usa a OLLI Orçamentos e está há alguns dias sem orçamento novo.';
    if (dados.etapa === 'd7') {
      return {
        subject: 'Tem algum serviço para orçar esta semana?',
        preview: 'Seus clientes e orçamentos já estão salvos: o próximo sai rápido.',
        titulo: 'Tem serviço para orçar esta semana?',
        paragrafos: [
          `Seu último orçamento na OLLI Orçamentos foi em ${quando}.`,
          'Seus clientes e orçamentos anteriores já estão salvos, então o próximo sai mais rápido.',
        ],
        passos: null,
        cta: novoOrcamento,
        depois: ['Se algo atrapalhou, responda este e-mail ou fale com o suporte.'],
        motivo,
      };
    }
    return {
      subject: 'Seus clientes continuam salvos na OLLI Orçamentos',
      preview: 'Duas semanas sem orçamento novo. Tudo continua do jeito que você deixou.',
      titulo: 'Tudo continua do jeito que você deixou',
      paragrafos: [
        `Seu último orçamento foi em ${quando}. Seus clientes e orçamentos continuam salvos na sua conta.`,
        'Quando aparecer o próximo serviço, é só abrir e mandar o orçamento para o cliente.',
      ],
      passos: null,
      cta: novoOrcamento,
      depois: ['Este é o último lembrete deste tipo. Se algo atrapalhou, responda este e-mail ou fale com o suporte.'],
      motivo,
    };
  }

  if (dados.tipo === 'trial_acabando') {
    chavesExatas(dados, ['tipo', 'terminaEm'], 'dados_invalidos');
    const termina = new Date(dados.terminaEm);
    exigir(!Number.isNaN(termina.getTime()) && termina.toISOString() === dados.terminaEm, 'dados_invalidos');
    const quando = dataCurtaBrasilia(dados.terminaEm);
    const preco = reais(PRECO_PRO.mensalCentavos);
    // Desconto do anual DERIVADO da fonte (precosPlanos.ts), nunca escrito à mão.
    const descontoAnualPro = Math.round((PRECO_PRO.economiaAnualCentavos / (PRECO_PRO.mensalCentavos * 12)) * 100);
    return {
      subject: `Seu teste do Pro termina em ${quando}`,
      preview: 'O teste não cobra nada e não renova sozinho.',
      titulo: `Seu teste do Pro termina em ${quando}`,
      paragrafos: [
        'O teste não cobra nada e não renova sozinho: quando terminar, a conta volta ao plano Grátis e seus dados continuam salvos.',
        `Para continuar com o Pro, assine por ${preco}/mês — dá para pagar com Pix — e mantenha ${frasePro()}.`,
        `Se preferir pagar uma vez só, o plano anual sai por ${reais(PRECO_PRO.anualCentavos)}, ${descontoAnualPro}% a menos que 12 meses no mensal, também com Pix.`,
      ],
      passos: null,
      cta: { rotulo: 'Assinar o Pro', href: urlCom(appUrl, '/planos') },
      depois: ['Se preferir ficar no Grátis, não precisa fazer nada.'],
      motivo: 'Você recebe este aviso porque está testando o plano Pro da OLLI Orçamentos.',
    };
  }

  exigir(false, 'tipo_invalido');
  return null;
}

// ─── Layout ──────────────────────────────────────────────────────────────────
// Exportado (com os validadores acima) para o resumo diário do dinheiro parado
// (`resumoDinheiroTemplate.js`) sair com a MESMA casca — marca, contraste, botão de
// 44 px e rodapé com descadastro. `c.rotuloDescadastro` troca só o texto do link.

export function montarHtml(c, { logoSrc, supportHref, unsubscribeHref }) {
  const paragrafos = c.paragrafos
    .map((p) => `<p style="margin:0 0 16px;color:#344454;font-size:16px;line-height:1.6;">${htmlTexto(p)}</p>`)
    .join('\n                  ');
  const passos = c.passos
    ? `<ol style="margin:0 0 24px;padding-left:24px;color:#344454;font-size:16px;line-height:1.7;">
                    ${c.passos.map((p) => `<li>${htmlTexto(p)}</li>`).join('\n                    ')}
                  </ol>`
    : '';
  const depois = c.depois
    .map((p) => `<p style="margin:0 0 12px;color:#344454;font-size:16px;line-height:1.6;">${htmlTexto(p)}</p>`)
    .join('\n                  ');
  return `<!doctype html>
<html lang="pt-BR" dir="ltr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${htmlTexto(c.subject)}</title>
  </head>
  <body style="margin:0;background:#f2f5f7;color:#17212b;font-family:Arial,Helvetica,sans-serif;">
    <div lang="pt-BR" dir="ltr">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${htmlTexto(c.preview)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f2f5f7;">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;">
              <tr>
                <td style="padding:32px 28px 12px;text-align:center;">
                  <img src="${logoSrc}" width="72" height="72" alt="OLLI Orçamentos" style="display:block;width:72px;height:72px;margin:0 auto;border:0;">
                </td>
              </tr>
              <tr>
                <td style="padding:8px 28px 28px;">
                  <h1 style="margin:0 0 16px;color:#17212b;font-size:24px;line-height:1.3;text-align:center;">${htmlTexto(c.titulo)}</h1>
                  ${paragrafos}
                  ${passos}
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="padding:4px 0 24px;">
                        <a href="${atributoHtml(c.cta.href)}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 24px;border-radius:10px;background:#075f5a;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${htmlTexto(c.cta.rotulo)}</a>
                      </td>
                    </tr>
                  </table>
                  ${depois}
                  <p style="margin:0;color:#344454;font-size:16px;line-height:1.6;">Precisa de ajuda? <a href="${supportHref}" style="color:#075f5a;text-decoration:underline;">Falar com o suporte da OLLI Orçamentos</a>.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 28px;border-top:1px solid #d9e1e6;color:#5d6b78;font-size:14px;line-height:1.5;text-align:center;">${htmlTexto(c.motivo)} <a href="${unsubscribeHref}" style="color:#5d6b78;text-decoration:underline;">${htmlTexto(c.rotuloDescadastro ?? 'Parar de receber lembretes')}</a>.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`;
}

export function montarTexto(c, { supportUrl, unsubscribeUrl }) {
  const linhas = [c.titulo, '', ...c.paragrafos];
  if (c.passos) {
    linhas.push('');
    c.passos.forEach((p, i) => linhas.push(`${i + 1}. ${p.charAt(0).toUpperCase()}${p.slice(1)}`));
  }
  linhas.push('', `${c.cta.rotulo}: ${c.cta.href}`);
  if (c.depois.length) linhas.push('', ...c.depois);
  linhas.push('', `Suporte da OLLI Orçamentos: ${supportUrl}`);
  linhas.push('', c.motivo, `${c.rotuloDescadastro ?? 'Parar de receber lembretes'}: ${unsubscribeUrl}`);
  return linhas.join('\n');
}

/**
 * Renderiza um lembrete. Falha FECHADO em qualquer dado fora do esperado — um
 * lembrete que não renderiza vira dead_letter no consumer, nunca e-mail torto.
 */
export function renderizarEmailLembrete(input = {}) {
  chavesExatas(input, INPUT_KEYS, 'input_template_invalido');
  const eventId = idSeguro(input.eventId);
  exigir(eventId, 'event_id_invalido');

  const catalogo = [LEMBRETE_ATIVACAO, LEMBRETE_ASSINATURA, LEMBRETE_REENGAJAMENTO]
    .find((c) => c.template === input.template) ?? null;
  exigir(catalogo, 'template_invalido');
  exigir(input.templateVersion === catalogo.templateVersion, 'template_version_divergente');
  exigir(input.purpose === catalogo.purpose, 'purpose_invalido');

  const appUrl = urlHttps(input.appUrl, 'app_url_invalida');
  const supportUrl = urlHttps(input.supportUrl, 'support_url_invalida').toString();
  const logoUrl = urlHttps(input.logoUrl, 'logo_url_invalida').toString();
  const unsubscribeUrl = urlHttps(input.unsubscribeUrl, 'unsubscribe_url_invalida').toString();

  const conteudo = catalogo === LEMBRETE_ATIVACAO
    ? conteudoAtivacao(input.dados, appUrl)
    : catalogo === LEMBRETE_ASSINATURA
      ? conteudoAssinatura(input.dados, appUrl)
      : conteudoReengajamento(input.dados, appUrl);
  exigir(conteudo.subject.length <= 180 && !/[\r\n]/.test(conteudo.subject), 'subject_invalido');

  const html = montarHtml(conteudo, {
    logoSrc: atributoHtml(logoUrl),
    supportHref: atributoHtml(supportUrl),
    unsubscribeHref: atributoHtml(unsubscribeUrl),
  });
  const text = montarTexto(conteudo, { supportUrl, unsubscribeUrl });

  return congelarProfundo({
    rendererVersion: EMAIL_LEMBRETES_RENDERER_VERSION,
    template: catalogo.template,
    templateVersion: catalogo.templateVersion,
    purpose: catalogo.purpose,
    kind: 'lembrete',
    brand: EMAIL_LEMBRETES_BRAND,
    locale: 'pt-BR',
    eventId,
    subject: conteudo.subject,
    preview: conteudo.preview,
    html,
    text,
    unsubscribeUrl,
  });
}
