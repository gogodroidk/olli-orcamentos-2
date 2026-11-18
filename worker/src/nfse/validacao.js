/**
 * NFS-e — validação do pedido de emissão (módulo puro, sem rede).
 * O servidor NUNCA confia no que o app mandou: tudo é revalidado aqui antes de chegar ao provedor.
 */

export const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');

export function cpfValido(valor) {
  const c = soDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(c[t])) return false;
  }
  return true;
}

export function cnpjValido(valor) {
  const c = soDigitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  for (const t of [12, 13]) {
    let soma = 0;
    let peso = t - 7;
    for (let i = 0; i < t; i++) {
      soma += Number(c[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const dv = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (dv !== Number(c[t])) return false;
  }
  return true;
}

/** Valor em centavos inteiros: 0 < v <= R$ 1.000.000,00 (teto de sanidade; o município limita de verdade). */
export function centavosValidos(v) {
  return Number.isInteger(v) && v > 0 && v <= 100_000_000;
}

const ID_ORCAMENTO_RE = /^[A-Za-z0-9_-]{1,64}$/;
const IBGE_RE = /^\d{7}$/;

/**
 * @param {unknown} corpo  corpo do POST /nfse/emitir
 * @returns {{ok:true, pedido:object}|{ok:false, erros:string[]}}
 * pedido = { orcamentoId, tomador:{documento, nome, email?}, servico:{descricao, valorCentavos, issRetido} }
 * Prestador (CNPJ, IM, município, regime, código do serviço) NÃO vem do app: vem do perfil_fiscal no banco.
 */
export function validarPedido(corpo) {
  const erros = [];
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const t = c.tomador && typeof c.tomador === 'object' ? c.tomador : {};
  const s = c.servico && typeof c.servico === 'object' ? c.servico : {};

  if (typeof c.orcamentoId !== 'string' || !ID_ORCAMENTO_RE.test(c.orcamentoId)) erros.push('orcamento_invalido');

  const doc = soDigitos(t.documento);
  if (doc.length === 11 ? !cpfValido(doc) : doc.length === 14 ? !cnpjValido(doc) : true) erros.push('tomador_documento_invalido');
  const nome = typeof t.nome === 'string' ? t.nome.trim() : '';
  if (nome.length < 2 || nome.length > 150) erros.push('tomador_nome_invalido');
  let email = null;
  if (t.email != null && t.email !== '') {
    if (typeof t.email === 'string' && t.email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)) email = t.email.trim();
    else erros.push('tomador_email_invalido');
  }

  const descricao = typeof s.descricao === 'string' ? s.descricao.trim() : '';
  if (descricao.length < 3 || descricao.length > 1000) erros.push('servico_descricao_invalida');
  if (!centavosValidos(s.valorCentavos)) erros.push('servico_valor_invalido');
  if (s.issRetido != null && typeof s.issRetido !== 'boolean') erros.push('servico_iss_retido_invalido');

  if (erros.length) return { ok: false, erros };
  return {
    ok: true,
    pedido: {
      orcamentoId: c.orcamentoId,
      tomador: { documento: doc, nome, email },
      servico: { descricao, valorCentavos: s.valorCentavos, issRetido: s.issRetido === true },
    },
  };
}

/**
 * Perfil fiscal do prestador (linha de `perfil_fiscal`) completo o bastante para emitir?
 * @returns {string[]} campos que faltam ([] = ok)
 */
export function faltaNoPerfil(p) {
  const f = [];
  if (!p || typeof p !== 'object') return ['perfil_fiscal'];
  if (!cnpjValido(p.cnpj)) f.push('cnpj');
  if (!p.inscricao_municipal || String(p.inscricao_municipal).length > 30) f.push('inscricao_municipal');
  if (!IBGE_RE.test(String(p.codigo_municipio_ibge || ''))) f.push('codigo_municipio_ibge');
  if (!['mei', 'simples', 'outro'].includes(p.regime)) f.push('regime');
  if (!p.codigo_servico || String(p.codigo_servico).length > 20) f.push('codigo_servico');
  const al = Number(p.aliquota_iss);
  if (!(al >= 0 && al <= 5)) f.push('aliquota_iss');
  return f;
}

/** Referência idempotente enviada ao provedor: estável por (conta, orçamento). */
export function referencia(userId, orcamentoId) {
  return `olli-${String(userId).replace(/-/g, '').slice(0, 12)}-${orcamentoId}`.slice(0, 80);
}
