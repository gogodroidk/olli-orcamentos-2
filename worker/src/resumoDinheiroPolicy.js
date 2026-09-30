/**
 * Decisão PURA do RESUMO DIÁRIO "dinheiro parado" (e-mail das 7h).
 *
 * Não inventa regra de radar: a conta é `resumirDinheiroParado` de
 * `src/services/radarDinheiro.ts`, a MESMA função que desenha a tela Início do
 * painel (para onde o e-mail leva). Aqui só entram:
 *   - a JANELA: 7h–8h de Brasília, segunda a sábado (domingo é dia mudo, como o
 *     "Bom dia da OLLI" do app), em rodadas de 10 em 10 minutos;
 *   - a conversão das linhas que o banco devolve (`dados_resumo_dinheiro`) para a
 *     entrada da regra — tolerante a lixo, mas sem nunca completar dado faltante;
 *   - os parâmetros mínimos do e-mail (`template_dados`, só números + a data) e a
 *     chave de idempotência por conta + dia.
 *
 * "Clientes para lembrar" (pós-venda) é a regra de `src/utils/posVenda.ts` — a MESMA
 * do cartão do painel e da Home do app: intervalo do OFÍCIO da empresa
 * (`empresa.dados.verticais`), só serviço concluído, adiamento e lembrete recente
 * respeitados. Por isso o banco devolve também `verticais` e `lembrados`
 * (migration 20260930120500); resposta SEM esses campos = RPC antiga = "não sei" =
 * nenhum e-mail (`dados_sem_posvenda`), nunca uma contagem com a regra errada.
 *
 * Nada acionável (sem saldo a receber, sem proposta parada, sem cliente para
 * lembrar) = nenhum e-mail. Lista truncada no banco = "não sei" = nenhum e-mail (um número
 * calculado em cima de meia lista seria mentira sobre o caixa do dono).
 */

import { resumirDinheiroParado } from '../../src/services/radarDinheiro.ts';

export const RESUMO_DINHEIRO_POLICY_VERSION = '2026-09-30.v2';

export const RESUMO_DINHEIRO = Object.freeze({
  template: 'resumo_dinheiro',
  // v2 (30/09/2026): `clientesSumidos` (150 dias fixos) virou `clientesParaLembrar`.
  templateVersion: 'resumo_dinheiro.v2',
  purpose: 'money_digest',
});

/** Quantas rodadas cabem na janela das 7h (uma a cada 10 minutos). */
export const RESUMO_RODADAS = 6;

/** Brasília não tem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

function objeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function relogioBrasilia(agora) {
  return new Date(agora.getTime() + OFFSET_BRASILIA_MS);
}

/** 'AAAA-MM-DD' no calendário de Brasília. */
export function diaBrasilia(agora) {
  return relogioBrasilia(agora).toISOString().slice(0, 10);
}

/**
 * Índice da rodada (0–5) quando `agora` cai numa rodada do resumo; senão `null`.
 * Rodada = 7h00, 7h10, … 7h50 de Brasília, de segunda a sábado.
 */
export function rodadaDoResumo(agora) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return null;
  const b = relogioBrasilia(agora);
  if (b.getUTCDay() === 0) return null; // domingo é dia mudo
  if (b.getUTCHours() !== 7) return null;
  const minuto = b.getUTCMinutes();
  if (minuto % 10 !== 0) return null;
  return minuto / 10;
}

export function chaveResumo(userId, dia) {
  return `resumo:dinheiro:${userId}:${dia}`;
}

// ─── Linhas do banco → entrada da regra ─────────────────────────────────────

function textoOuNull(v) {
  return typeof v === 'string' ? v : null;
}

function numeroOuNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Blob mínimo: só as chaves que a regra lê, com o tipo que ela espera. */
function blob(d, campos) {
  if (!objeto(d)) return null;
  const saida = {};
  for (const [chave, tipo] of campos) {
    const v = d[chave];
    if (tipo === 'numero') saida[chave] = v;
    else saida[chave] = textoOuNull(v);
  }
  return saida;
}

const CAMPOS_ORC = [['valorTotal', 'numero'], ['subtotal', 'numero'], ['atualizadoEm'], ['criadoEm'], ['clienteId']];
const CAMPOS_REC = [['orcamentoId'], ['valorRecebido', 'numero'], ['dataRecebimento'], ['clienteId'], ['criadoEm'], ['estornadoEm']];

function lista(v) {
  return Array.isArray(v) ? v : null;
}

/** Mapa id → ISO só com pares string→string (mesmo filtro do painel: `useRadarSnooze`/`lerMapaEnvios`). */
function mapaDeDatas(v) {
  const saida = {};
  if (!objeto(v)) return saida;
  for (const [id, iso] of Object.entries(v)) {
    if (typeof iso === 'string' && iso) saida[id] = iso;
  }
  return saida;
}

/** Ofícios da empresa: lista de ids (strings) ou `null` (= sem ofício → intervalo genérico). */
function verticaisDoBanco(v) {
  if (!Array.isArray(v)) return null;
  const ids = v.filter((x) => typeof x === 'string' && x);
  return ids.length > 0 ? ids : null;
}

/** A RPC já devolve os campos do pós-venda? (Sem a migration 20260930120500, não.) */
export function temDadosPosVenda(resposta) {
  return objeto(resposta) && Object.hasOwn(resposta, 'verticais') && Object.hasOwn(resposta, 'lembrados');
}

/**
 * Converte a resposta de `dados_resumo_dinheiro` na entrada de
 * `resumirDinheiroParado`. Devolve `null` quando a resposta não tem o formato
 * esperado (não sei ≠ vazio: quem chama pula a conta).
 */
export function entradaDoBanco(resposta) {
  if (!objeto(resposta)) return null;
  const orcamentos = lista(resposta.orcamentos);
  const recibos = lista(resposta.recibos);
  const clientes = lista(resposta.clientes);
  const agendamentos = lista(resposta.agendamentos);
  const osConcluidas = lista(resposta.osConcluidas);
  if (!orcamentos || !recibos || !clientes || !agendamentos || !osConcluidas) return null;
  if (typeof resposta.truncado !== 'boolean') return null;

  // Mesmo filtro do painel (`useRadarSnooze`): só pares string→string.
  const adiados = mapaDeDatas(resposta.adiados);

  return {
    truncado: resposta.truncado,
    entrada: {
      orcamentos: orcamentos.filter(objeto).map((o) => ({
        id: textoOuNull(o.id),
        status: textoOuNull(o.status),
        cliente_id: textoOuNull(o.cliente_id),
        valor_total: numeroOuNull(o.valor_total),
        subtotal: numeroOuNull(o.subtotal),
        criado_em: textoOuNull(o.criado_em),
        atualizado_em: textoOuNull(o.atualizado_em),
        dados: blob(o.dados, CAMPOS_ORC),
      })),
      recibos: recibos.filter(objeto).map((r) => ({
        orcamento_id: textoOuNull(r.orcamento_id),
        cliente_id: textoOuNull(r.cliente_id),
        valor_recebido: numeroOuNull(r.valor_recebido),
        criado_em: textoOuNull(r.criado_em),
        dados: blob(r.dados, CAMPOS_REC),
      })),
      clientes: clientes.filter((id) => typeof id === 'string').map((id) => ({ id })),
      agendamentos: agendamentos.filter(objeto).map((a) => ({
        cliente_id: textoOuNull(a.cliente_id),
        status: textoOuNull(a.status),
        inicio: textoOuNull(a.inicio),
        fim: textoOuNull(a.fim),
      })),
      adiados,
      lembrados: mapaDeDatas(resposta.lembrados),
      verticais: verticaisDoBanco(resposta.verticais),
      orcamentosFinalizados: new Set(osConcluidas.filter((id) => typeof id === 'string').map((id) => id.trim())),
    },
  };
}

function decisao(motivo, pedido = null) {
  return Object.freeze({ version: RESUMO_DINHEIRO_POLICY_VERSION, enfileirar: pedido !== null, motivo, pedido });
}

/**
 * Decide o resumo de UMA conta a partir da resposta do banco. Pedido = o que vai
 * para `enqueue_resumo_dinheiro_email` (o banco reconfere janela, chave, tetos,
 * preferência e "acionável" sob trava).
 */
export function decidirResumo(userId, resposta, { agora } = {}) {
  if (!(agora instanceof Date) || Number.isNaN(agora.getTime())) return decisao('agora_invalido');
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) return decisao('conta_invalida');
  const convertido = entradaDoBanco(resposta);
  if (!convertido) return decisao('dados_invalidos');
  if (!temDadosPosVenda(resposta)) return decisao('dados_sem_posvenda');
  if (convertido.truncado) return decisao('dados_truncados');

  const resumo = resumirDinheiroParado(convertido.entrada, agora);
  if (!resumo.acionavel) return decisao('nada_acionavel');

  const dia = diaBrasilia(agora);
  if (!DIA_RE.test(dia)) return decisao('agora_invalido');
  const a = resumo.aReceber;
  const dados = {
    data: dia,
    aReceberCentavos: a.itens > 0 ? a.centavos : 0,
    aReceberItens: a.itens,
    diasMaisAntigo: a.itens > 0 && Number.isInteger(a.diasMaisAntigo) ? a.diasMaisAntigo : null,
    semValor: a.semValor,
    propostasParadas: resumo.propostasParadas,
    clientesParaLembrar: resumo.clientesParaLembrar,
  };
  return decisao('acionavel', Object.freeze({
    userId,
    idempotencyKey: chaveResumo(userId, dia),
    dados: Object.freeze(dados),
  }));
}
