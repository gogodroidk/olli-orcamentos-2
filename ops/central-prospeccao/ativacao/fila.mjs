// Quem entra na fila, em que ordem, e se agora pode sair uma mensagem.
// Puro: sem Chatwoot, sem arquivo, sem rede.
import { e164, ehNumeroDaCasa, telefoneSuprimido } from './telefones.mjs';
import { papelDe } from './mensagens.mjs';

export const LIMITE_DIA = 12;
export const LIMITE_HORA = 3;
export const INTERVALO_MIN = 4;
export const INTERVALO_MAX = 10;

export function relogioSP(agora = new Date()) {
  const br = new Date(agora.getTime() - 3 * 3600 * 1000);
  const y = br.getUTCFullYear();
  const m = String(br.getUTCMonth() + 1).padStart(2, '0');
  const d = String(br.getUTCDate()).padStart(2, '0');
  return {
    diaSemana: br.getUTCDay(),
    hora: br.getUTCHours(),
    minuto: br.getUTCMinutes(),
    data: `${y}-${m}-${d}`,
  };
}

/** seg–sáb, 9h inclusive até 18h exclusive, horário de Brasília. */
export function janelaAberta(agora = new Date()) {
  const r = relogioSP(agora);
  return r.diaSemana >= 1 && r.diaSemana <= 6 && r.hora >= 9 && r.hora < 18;
}

export function intervaloAleatorioMin(aleatorio = Math.random) {
  const n = Number(aleatorio());
  const faixa = INTERVALO_MAX - INTERVALO_MIN + 1;
  return INTERVALO_MIN + Math.min(faixa - 1, Math.max(0, Math.floor(n * faixa)));
}

function alvoComum(pessoa) {
  const orc = Number(pessoa?.orcamentos ?? 0);
  const papel = papelDe(pessoa);
  if (papel === 'luiz' || papel === 'mk') return orc >= 0;
  return orc <= 1 && !['pagou', 'aprovado'].includes(String(pessoa?.etapa ?? ''));
}

/**
 * Motivo de ficar de fora, ou '' se pode entrar na fila.
 * hashesCsv = Set de sha256. syncFresca false barra todo mundo (a lista de
 * supressão com mais de 24 h não prova que o pedido de parar de hoje está nela).
 */
export function motivoFora(pessoa, { hashesCsv, syncFresca, teste = false, estadoItem = null } = {}) {
  if (!syncFresca) return 'supressao_velha';
  if (!(hashesCsv instanceof Set)) return 'supressao_ausente';
  if (!pessoa?.conta_id) return 'sem_conta';
  if (estadoItem?.status === 'enviado') return 'ja_enviado';
  if (estadoItem?.status === 'pulado' && ['ja_respondeu', 'parar-contato', 'cliente-antigo'].includes(estadoItem.motivo)) {
    return estadoItem.motivo;
  }
  if (pessoa.paga === true || pessoa.plano === 'pro' || pessoa.plano === 'empresa') return 'ja_paga';
  if (pessoa.suprimido === true) return 'suprimido_banco';
  const fone = e164(pessoa.telefone_e164);
  if (!fone) return 'sem_telefone';
  if (telefoneSuprimido(fone, hashesCsv)) return 'supressao_csv';
  if (!alvoComum(pessoa)) return 'fora_do_alvo';
  if (teste && !ehNumeroDaCasa(fone)) return 'teste_so_numero_da_casa';
  if (!teste && ehNumeroDaCasa(fone)) return 'numero_da_casa';
  return '';
}

export function ordenarFila(pessoas) {
  return [...pessoas].sort((a, b) => {
    const pa = Number.isFinite(Number(a.prioridade)) ? Number(a.prioridade) : (papelDe(a) === 'luiz' ? 0 : papelDe(a) === 'mk' ? 1 : 2);
    const pb = Number.isFinite(Number(b.prioridade)) ? Number(b.prioridade) : (papelDe(b) === 'luiz' ? 0 : papelDe(b) === 'mk' ? 1 : 2);
    if (pa !== pb) return pa - pb;
    const oa = Number(a.orcamentos ?? 0);
    const ob = Number(b.orcamentos ?? 0);
    if (oa !== ob) return oa - ob;
    return String(b.cadastro ?? '').localeCompare(String(a.cadastro ?? ''));
  });
}

export function montarFila(pessoas, ctx) {
  const fila = [];
  const fora = [];
  for (const pessoa of ordenarFila(pessoas)) {
    const motivo = motivoFora(pessoa, { ...ctx, estadoItem: ctx.estado?.itens?.[pessoa.conta_id] });
    if (motivo) fora.push({ conta_id: pessoa.conta_id, motivo });
    else fila.push(pessoa);
  }
  return { fila, fora };
}

function marcasDeEnvio(item) {
  const marcas = [];
  if (item?.status === 'enviado' && item.em) marcas.push(item.em);
  if (item?.followup_em) marcas.push(item.followup_em);
  return marcas;
}

function enviadosRecentes(estado, agora) {
  const dia = relogioSP(agora).data;
  const corteHora = agora.getTime() - 60 * 60 * 1000;
  let noDia = 0;
  let naHora = 0;
  for (const item of Object.values(estado?.itens ?? {})) {
    for (const em of marcasDeEnvio(item)) {
      const t = new Date(em).getTime();
      if (Number.isNaN(t)) continue;
      if (relogioSP(new Date(t)).data === dia) noDia += 1;
      if (t >= corteHora) naHora += 1;
    }
  }
  return { noDia, naHora };
}

/**
 * Decide o que este processo faz agora: no máximo 1 envio.
 * acao: enviar | esperar | fora_janela | fila_vazia | frear
 * limiteDia/limiteHora/idDe/elegivel existem para outra campanha usar o mesmo freio.
 * Sem esses argumentos, o comportamento da ativação não muda.
 */
export function decidir({
  agora = new Date(),
  estado = {},
  fila = [],
  freio = null,
  evolutionAberta = true,
  limiteDia = LIMITE_DIA,
  limiteHora = LIMITE_HORA,
  idDe = (p) => p.conta_id,
  elegivel = null,
} = {}) {
  if (freio?.motivo) return { acao: 'frear', motivo: freio.motivo };
  if (!evolutionAberta) return { acao: 'frear', motivo: 'evolution_desconectada' };
  if (!janelaAberta(agora)) return { acao: 'fora_janela', motivo: 'fora_do_horario' };
  if (estado.proximo_em && new Date(estado.proximo_em).getTime() > agora.getTime()) {
    return { acao: 'esperar', motivo: 'intervalo', proximo_em: estado.proximo_em };
  }
  const caps = enviadosRecentes(estado, agora);
  if (caps.noDia >= limiteDia) return { acao: 'esperar', motivo: 'teto_dia' };
  if (caps.naHora >= limiteHora) return { acao: 'esperar', motivo: 'teto_hora' };
  const pessoa = fila.find((p) => (elegivel ? elegivel(p, estado) : estado.itens?.[idDe(p)]?.status !== 'enviado'));
  if (!pessoa) return { acao: 'fila_vazia', motivo: 'ninguem' };
  return { acao: 'enviar', pessoa, motivo: 'ok' };
}
