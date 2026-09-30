/**
 * Funil de receita por coorte semanal — formato que o painel ADMIN mostra.
 *
 * O cálculo mora no banco (`admin_funil_coortes`, migration
 * 20260930120100_funil_receita.sql); aqui só se valida e se dá forma à resposta.
 * Nada de PII: entram e saem contagens e medianas por semana de cadastro.
 *
 * Três estados (armadilha P0 "erro vira vazio"): linha que não veio fica `null`
 * (o painel mostra "—"), nunca 0. Resposta com formato inesperado LANÇA — o
 * handler responde erro, e o painel diz que não sabe, em vez de mostrar zeros.
 */

/** Ordem e nome de cada degrau. As chaves são as mesmas da função SQL. */
export const DEGRAUS_FUNIL = Object.freeze([
  { ordem: 1, chave: 'cadastro', rotulo: 'Cadastro' },
  { ordem: 2, chave: 'entrou', rotulo: 'Entrou' },
  { ordem: 3, chave: 'perfil_empresa', rotulo: 'Perfil da empresa' },
  { ordem: 4, chave: 'primeiro_cliente', rotulo: '1º cliente' },
  { ordem: 5, chave: 'primeiro_orcamento', rotulo: '1º orçamento' },
  { ordem: 6, chave: 'orcamento_enviado', rotulo: 'Enviado' },
  { ordem: 7, chave: 'orcamento_aprovado', rotulo: 'Aprovado' },
  { ordem: 8, chave: 'teste_pro', rotulo: 'Teste Pro' },
  { ordem: 9, chave: 'pagou', rotulo: 'Pagou' },
]);

/** Regras de exclusão devolvidas por `admin_funil_exclusoes`. */
export const REGRAS_EXCLUSAO_FUNIL = Object.freeze({
  dono: 'E-mail do dono',
  lista_interna: 'Lista de contas internas',
  admin: 'Administradores',
  cortesia: 'Plano manual (cortesia/demo)',
  membro_equipe: 'Membros de equipe',
});

export const FUNIL_SEMANAS_PADRAO = 12;
export const FUNIL_SEMANAS_MAX = 104;

/** `?semanas=` do painel → inteiro 1..104; qualquer outra coisa → padrão. */
export function semanasFunil(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) return FUNIL_SEMANAS_PADRAO;
  return Math.min(n, FUNIL_SEMANAS_MAX);
}

const CHAVES = new Set(DEGRAUS_FUNIL.map((d) => d.chave));
const SEMANA = /^\d{4}-\d{2}-\d{2}$/;

function contagem(v, campo) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`funil_${campo}_invalido`);
  return n;
}

function horas(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('funil_mediana_invalida');
  return n;
}

/** Conversão em % inteiro; sem denominador (ou denominador 0) não há taxa. */
export function taxaConversao(comAnterior, noAnterior) {
  if (comAnterior === null || noAnterior === null || noAnterior === 0) return null;
  return Math.round((comAnterior / noAnterior) * 100);
}

function celula(linha) {
  const contas = contagem(linha.contas, 'contas');
  const noAnterior = contagem(linha.contas_no_anterior, 'no_anterior');
  const comAnterior = contagem(linha.contas_com_anterior, 'com_anterior');
  if (contas === null) throw new Error('funil_contas_ausente');
  return {
    contas,
    noAnterior,
    comAnterior,
    taxa: taxaConversao(comAnterior, noAnterior),
    medianaHorasAnterior: horas(linha.mediana_horas_desde_anterior),
    medianaHorasCadastro: horas(linha.mediana_horas_desde_cadastro),
  };
}

/** Degrau sem linha = não sei (null), nunca zero. */
function porDegrau(mapa) {
  return DEGRAUS_FUNIL.map((d) => (mapa.has(d.chave) ? mapa.get(d.chave) : null));
}

/**
 * Linhas cruas das duas RPCs → resposta do painel.
 *   total   : 9 células (todas as coortes da janela; semana NULL no SQL)
 *   coortes : [{ semana:'AAAA-MM-DD', degraus: 9 células }], mais recente primeiro
 *   exclusoes: [{ regra, rotulo, contas }] e o total excluído
 */
export function montarFunil(linhas, exclusoes, semanas = FUNIL_SEMANAS_PADRAO) {
  if (!Array.isArray(linhas) || !Array.isArray(exclusoes)) throw new Error('funil_formato_invalido');

  const total = new Map();
  const semanasMapa = new Map();
  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object' || !CHAVES.has(linha.degrau)) throw new Error('funil_degrau_invalido');
    const semana = linha.semana === null || linha.semana === undefined ? null : String(linha.semana);
    if (semana !== null && !SEMANA.test(semana)) throw new Error('funil_semana_invalida');
    const destino = semana === null ? total : (semanasMapa.get(semana) || new Map());
    if (destino.has(linha.degrau)) throw new Error('funil_linha_duplicada');
    destino.set(linha.degrau, celula(linha));
    if (semana !== null) semanasMapa.set(semana, destino);
  }

  const coortes = [...semanasMapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([semana, mapa]) => ({ semana, degraus: porDegrau(mapa) }));

  const regras = exclusoes.map((e) => {
    if (!e || !Object.prototype.hasOwnProperty.call(REGRAS_EXCLUSAO_FUNIL, e.regra)) throw new Error('funil_regra_invalida');
    return { regra: e.regra, rotulo: REGRAS_EXCLUSAO_FUNIL[e.regra], contas: contagem(e.contas, 'exclusao') ?? 0 };
  });

  return {
    semanas,
    degraus: DEGRAUS_FUNIL.map((d) => ({ ...d })),
    // Sem nenhuma conta na janela o SQL não devolve linha: total fica null
    // por degrau e `vazio` diz que é "ninguém cadastrou", não "não sei".
    vazio: linhas.length === 0,
    total: porDegrau(total),
    coortes,
    exclusoes: regras,
    contasExcluidas: regras.reduce((s, r) => s + r.contas, 0),
  };
}
