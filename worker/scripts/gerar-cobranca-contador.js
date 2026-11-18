#!/usr/bin/env node
/**
 * gerar-cobranca-contador — monta a cobrança do simulador white-label da reforma
 * (implantação em Pix avulso + mensalidade em Pix Automático) para UM escritório.
 *
 *   node worker/scripts/gerar-cobranca-contador.js --escritorio "Contabil X" --email x@x.com.br
 *   node worker/scripts/gerar-cobranca-contador.js ... --confirmo   (chama a AbacatePay DE VERDADE)
 *
 * PADRÃO = ENSAIO (--seco): só imprime o que SERIA enviado. Nenhuma chamada de rede.
 * --confirmo só roda se TODAS as travas passarem:
 *   1. ABACATEPAY_API_KEY no ambiente (nunca impressa) e de produção (abc_prod_…);
 *   2. OLLI_PRECO_CONFIRMADO=sim  (o preço R$ 497 + R$ 149 é provisório, D-2141, até o Maquiavel/Igor fechar);
 *   3. --valor-implantacao e --valor-mensal informados em reais (o ensaio usa o provisório, o real não);
 *   4. --aceite "<referência do aceite>" (e-mail/WhatsApp em que o escritório aprovou a demo + contrato).
 * O --confirmo cria SÓ o Pix da implantação (POST /v2/transparents/create). A mensalidade só é criada
 * com --produto-mensal prod_… (produto MONTHLY já criado no painel) e depois de a implantação estar paga.
 *
 * O externalId é `olli:b2b:<slug>:<aaaammdd>:<tipo>` (NÃO é `olli:pl:…`): o webhook de planos do app
 * ignora a cobrança, então pagar isto nunca libera plano Pro/Empresa. Confirmar pagamento = --checar <pix_char_…>.
 * Sem dependências. Fonte da API: docs/ABACATEPAY.md §3.4 e §3.6.
 */
const ABACATE_API = 'https://api.abacatepay.com/v2';
export const PRECO_PROVISORIO = Object.freeze({ implantacaoReais: 497, mensalReais: 149, fonte: 'D-2141 (provisório; a confirmar pelo Maquiavel/Igor)' });
const PIX_EXPIRA_S = 3 * 24 * 3600; // 3 dias: tempo de o contador abrir o banco
const RE_PRODUTO = /^prod_[A-Za-z0-9_-]{4,80}$/;

/** Mesmo saneamento de descricaoAbacate (src/abacate.js): a AbacatePay recusa acento e símbolos. */
export function descricaoAscii(t) {
  return String(t || 'OLLI').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,-]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100);
}
export function slug(t) {
  return descricaoAscii(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'escritorio';
}
export function centavos(reais) {
  const n = Number(String(reais).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 100000) throw new Error(`valor inválido: ${reais}`);
  return Math.round(n * 100);
}

/** Monta os pedidos (sem rede). Devolve { pedidos:[{etapa,metodo,caminho,corpo}], avisos }. */
export function montarCobranca(o, hoje = new Date()) {
  if (!o.escritorio) throw new Error('falta --escritorio');
  const dia = hoje.toISOString().slice(0, 10).replace(/-/g, '');
  const s = slug(o.escritorio);
  const impl = centavos(o.valorImplantacao ?? PRECO_PROVISORIO.implantacaoReais);
  const mens = centavos(o.valorMensal ?? PRECO_PROVISORIO.mensalReais);
  const avisos = [];
  if (o.valorImplantacao == null || o.valorMensal == null) avisos.push(`Preço PROVISÓRIO (${PRECO_PROVISORIO.fonte}). Não vale para cobrança real.`);
  const pedidos = [{
    etapa: '1. implantação (Pix avulso)',
    metodo: 'POST', caminho: '/transparents/create',
    corpo: {
      method: 'PIX',
      data: {
        amount: impl, expiresIn: PIX_EXPIRA_S,
        description: descricaoAscii(`OLLI Simulador Reforma - implantacao ${o.escritorio}`),
        externalId: `olli:b2b:${s}:${dia}:impl`,
        metadata: { externalId: `olli:b2b:${s}:${dia}:impl`, tipo: 'implantacao_reforma', aceite: o.aceite || 'PENDENTE' },
      },
    },
  }];
  if (o.produtoMensal) {
    if (!RE_PRODUTO.test(o.produtoMensal)) throw new Error('--produto-mensal deve ser prod_…');
    pedidos.push({
      etapa: '2. mensalidade (Pix Automático, só depois da implantação paga)',
      metodo: 'POST', caminho: '/subscriptions/create',
      corpo: { items: [{ id: o.produtoMensal, quantity: 1 }], methods: ['PIX'], externalId: `olli:b2b:${s}:${dia}:mens`, metadata: { externalId: `olli:b2b:${s}:${dia}:mens` } },
    });
  } else {
    avisos.push(`Mensalidade (${(mens / 100).toFixed(2)}) NÃO montada: falta --produto-mensal prod_… (produto MONTHLY de R$ ${(mens / 100).toFixed(2)} criado no painel; o do Pro, R$ 39, não serve). Pix Automático ainda depende de liberação da AbacatePay na loja (docs/ABACATEPAY.md).`);
  }
  return { pedidos, avisos, valores: { implantacaoCentavos: impl, mensalCentavos: mens } };
}

/** Travas do --confirmo. Devolve lista de motivos para recusar ([] = pode). */
export function travas(o, env) {
  const m = [];
  const chave = String(env.ABACATEPAY_API_KEY || '').trim();
  if (!chave) m.push('ABACATEPAY_API_KEY ausente');
  else if (chave.startsWith('abc_dev_')) m.push('chave é de desenvolvimento (abc_dev_…): geraria QR falso');
  if (env.OLLI_PRECO_CONFIRMADO !== 'sim') m.push('OLLI_PRECO_CONFIRMADO=sim ausente (preço ainda a confirmar)');
  if (o.valorImplantacao == null || o.valorMensal == null) m.push('informe --valor-implantacao e --valor-mensal');
  if (!o.aceite) m.push('informe --aceite "<referência do aceite do escritório>"');
  return m;
}

export async function executar(o, env, http = fetch) {
  const plano = montarCobranca(o);
  const saida = [];
  for (const p of plano.pedidos) {
    const r = await http(`${ABACATE_API}${p.caminho}`, {
      method: p.metodo,
      headers: { Authorization: `Bearer ${env.ABACATEPAY_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(p.corpo),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.error || !j.data) throw new Error(`${p.etapa}: AbacatePay respondeu ${r.status}`);
    saida.push({ etapa: p.etapa, id: j.data.id, status: j.data.status, brCode: j.data.brCode, url: j.data.url, expiresAt: j.data.expiresAt });
  }
  return saida;
}

function args(argv) {
  const o = {}; const mapa = { '--escritorio': 'escritorio', '--email': 'email', '--valor-implantacao': 'valorImplantacao', '--valor-mensal': 'valorMensal', '--produto-mensal': 'produtoMensal', '--aceite': 'aceite' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confirmo') o.confirmo = true;
    else if (argv[i] === '--seco') o.seco = true;
    else if (mapa[argv[i]]) o[mapa[argv[i]]] = argv[++i];
    else throw new Error(`argumento desconhecido: ${argv[i]}`);
  }
  return o;
}

async function main() {
  const o = args(process.argv.slice(2));
  const plano = montarCobranca(o);
  const real = o.confirmo && !o.seco;
  console.log(real ? '=== COBRANÇA REAL ===' : '=== ENSAIO (--seco): nada foi enviado à AbacatePay ===');
  console.log(`Escritório: ${o.escritorio}${o.email ? ` <${o.email}>` : ''}`);
  for (const p of plano.pedidos) console.log(`\n${p.etapa}\n  ${p.metodo} ${ABACATE_API}${p.caminho}\n  corpo: ${JSON.stringify(p.corpo, null, 2).replace(/\n/g, '\n  ')}`);
  for (const a of plano.avisos) console.log(`\n⚠ ${a}`);
  if (!real) { console.log('\nPara cobrar de verdade: --confirmo (com as 4 travas do cabeçalho).'); return; }
  const bloqueios = travas(o, process.env);
  if (bloqueios.length) { console.error(`\nRECUSADO:\n - ${bloqueios.join('\n - ')}`); process.exit(2); }
  const r = await executar(o, process.env);
  console.log('\nCriado:', JSON.stringify(r, null, 2));
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(`erro: ${e.message}`); process.exit(1); });
