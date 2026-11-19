/**
 * Aba "Funil de uso" do painel ADM (pedido da CPO, TOP10 #2, 19/11/2026).
 *
 * Lê a view `public.funil_uso` (migration 20261023160000: 1 linha por conta com a 1ª vez de cada passo) e devolve
 * só CONTAGENS e MEDIANAS: nenhum id, e-mail ou nome sai daqui. Contas internas (Igor, equipe, testes) ficam fora,
 * pelo mesmo critério das outras abas.
 *
 * Três estados (armadilha P0): leitura falhou = erro explícito (503), nunca "0 pessoas". Vazio de verdade = o rastreio
 * de telas ainda está desligado no app (EXPO_PUBLIC_RASTREIO_TELAS), que só liga 7 dias depois da política publicada.
 */

/** Passos na ordem da jornada: [coluna da view, rótulo da tela]. */
export const PASSOS_FUNIL_USO = Object.freeze([
  ['sessao_1', 'Abriu o app'],
  ['signup', 'Cadastrou'],
  ['onboarding', 'Terminou a apresentação'],
  ['exemplo', 'Abriu o exemplo'],
  ['orcamento_criado', 'Criou orçamento'],
  ['orcamento_enviado', 'Enviou orçamento'],
  ['gate', 'Bateu no limite do Grátis'],
  ['planos', 'Abriu Planos'],
  ['pix_gerado', 'Gerou Pix'],
  ['pix_pago', 'Pagou'],
]);

/** Teto de linhas lidas de uma vez (max_rows do PostgREST). Passou disso, a tela avisa que o número está cortado. */
export const FUNIL_USO_MAX_LINHAS = 1000;

function ms(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function mediana(valores) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

function minutosMediana(linhas, de, ate) {
  const m = mediana(
    linhas
      .map((l) => {
        const a = de(l);
        const b = ms(l[ate]);
        return a !== null && b !== null && b >= a ? (b - a) / 60000 : NaN;
      }),
  );
  return m === null ? null : Math.round(m * 10) / 10;
}

/**
 * Regra pura. `linhas` = linhas da view funil_uso; `idsInternas` = Set de user_id internos (ficam fora).
 * Devolve contagem por passo, % sobre o passo anterior (null quando o anterior é 0) e medianas em minutos.
 */
export function resumirFunilUso(linhas, idsInternas = new Set(), { cortado = false } = {}) {
  const todas = Array.isArray(linhas) ? linhas : [];
  const clientes = todas.filter((l) => l && !idsInternas.has(l.user_id));
  let anterior = null;
  const passos = PASSOS_FUNIL_USO.map(([chave, rotulo]) => {
    const pessoas = clientes.filter((l) => ms(l[chave]) !== null).length;
    const pctAnterior = anterior === null || anterior === 0 ? null : Math.round((pessoas / anterior) * 1000) / 10;
    anterior = pessoas;
    return { chave, rotulo, pessoas, pctAnterior };
  });
  const inicio = (l) => ms(l.signup) ?? ms(l.sessao_1);
  return {
    pessoas: clientes.length,
    internasFora: todas.length - clientes.length,
    cortado: !!cortado,
    passos,
    tempos: {
      minAte1oOrcamento: minutosMediana(clientes, inicio, 'orcamento_criado'),
      minAte1oEnvio: minutosMediana(clientes, inicio, 'orcamento_enviado'),
      minDoPixAoPagamento: minutosMediana(clientes, (l) => ms(l.pix_gerado), 'pix_pago'),
    },
  };
}
