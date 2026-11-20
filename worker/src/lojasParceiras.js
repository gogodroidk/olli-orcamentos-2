/**
 * Aba "Lojas" do painel ADM: contagem de cadastros por loja parceira (Balcão OLLI, RP-1119-1820, D-2711, 19/11/2026).
 *
 * SEM migration: a origem já é gravada no cadastro web (`user_metadata.origem_utm`, ver web/src/lib/atribuicao.ts).
 * O link da loja leva ao cadastro com `?utm_source=loja&utm_medium=balcao&utm_campaign=<codigo>` (especificação
 * 2026-11-19-lojas-parceiras-e-alto-valor/08, seção 1). Vale o PRIMEIRO toque; se o primeiro não for de loja, vale o
 * último (quem viu anúncio antes e cadastrou pelo QR da loja).
 *
 * Lista de lojas FIXA no código (decisão do CTO, D-2711): a tabela `lojas_parceiras` fica para quando houver mais de
 * um punhado de lojas. Código que chega com utm_source=loja mas não está na lista aparece na linha "código
 * desconhecido" (para achar erro de digitação no cartaz), nunca some.
 *
 * Só CONTAGENS: nenhum id, e-mail ou nome sai daqui. Contas internas (Igor, equipe, testes) ficam fora dos números e
 * são contadas à parte, para o cadastro TESTE pelo link da loja provar que a contagem anda sem sujar o número.
 */

/** Lojas do piloto. Código: `lj-` + sigla da região + 2 dígitos (nunca nome de pessoa, D-2503). */
export const LOJAS_PARCEIRAS = Object.freeze([
  // Loja fictícia para o teste de ponta a ponta (cadastro TESTE pelo link). Não é parceira; sai daqui quando a 1ª
  // loja real entrar.
  Object.freeze({ codigo: 'lj-tst-00', nome: 'Loja de teste (QA)', teste: true }),
]);

export const FORMATO_CODIGO_LOJA = /^lj-[a-z]{2,4}-\d{2}$/;
const DIA_MS = 86400000;

function texto(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/** Código da loja gravado no cadastro (ou null). Só olha toques com utm_source=loja. */
export function codigoLojaDoCadastro(metadata) {
  const origem = metadata && typeof metadata === 'object' ? metadata.origem_utm : null;
  if (!origem || typeof origem !== 'object') return null;
  for (const toque of [origem.primeiro_toque, origem.ultimo_toque]) {
    if (!toque || typeof toque !== 'object') continue;
    if (texto(toque.utm_source) !== 'loja') continue;
    const codigo = texto(toque.utm_campaign);
    return codigo || '(sem código)';
  }
  return null;
}

/**
 * @param {{ usuarios: Array<{id:string, created_at?:string, user_metadata?:object}>, idsInternas: Set<string>,
 *           idsComOrcamento: Set<string>|null, lojas?: ReadonlyArray<{codigo:string,nome:string}>, agoraMs?: number }} p
 * `idsComOrcamento = null` quando a leitura de orçamentos falhou: a coluna sai `null` (nunca 0).
 */
export function contarPorLoja({ usuarios, idsInternas, idsComOrcamento, lojas = LOJAS_PARCEIRAS, agoraMs = Date.now() }) {
  const linhas = new Map(lojas.map((l) => [l.codigo, { codigo: l.codigo, nome: l.nome, teste: !!l.teste, cadastros: 0, cadastros7: 0, orcaram: 0, internas: 0 }]));
  const desconhecidos = new Map();
  let internasFora = 0;
  for (const u of Array.isArray(usuarios) ? usuarios : []) {
    if (!u || !u.id) continue;
    const codigo = codigoLojaDoCadastro(u.user_metadata);
    if (!codigo) continue;
    const linha = linhas.get(codigo);
    if (idsInternas.has(u.id)) {
      internasFora++;
      if (linha) linha.internas++;
      continue;
    }
    if (!linha) {
      const chave = FORMATO_CODIGO_LOJA.test(codigo) ? codigo : '(fora do formato)';
      desconhecidos.set(chave, (desconhecidos.get(chave) || 0) + 1);
      continue;
    }
    linha.cadastros++;
    const criado = Date.parse(u.created_at || '');
    if (Number.isFinite(criado) && agoraMs - criado < 7 * DIA_MS) linha.cadastros7++;
    if (idsComOrcamento?.has(u.id)) linha.orcaram++;
  }
  const lista = [...linhas.values()].map((l) => ({ ...l, orcaram: idsComOrcamento ? l.orcaram : null }));
  return {
    lojas: lista,
    desconhecidos: [...desconhecidos.entries()].map(([codigo, cadastros]) => ({ codigo, cadastros })).sort((a, b) => b.cadastros - a.cadastros),
    internasFora,
    orcamentosEstado: idsComOrcamento ? 'ok' : 'indisponivel',
  };
}
