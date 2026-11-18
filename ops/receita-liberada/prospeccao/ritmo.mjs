// Ritmo da prospecção. A janela e o freio vêm da ativação; o teto e o intervalo são os desta campanha.
import { decidir, relogioSP } from '../../ativacao/fila.mjs';

export const LIMITE_DIA = 10;
export const LIMITE_HORA = 3;
export const INTERVALO_MIN = 5;
export const INTERVALO_MAX = 12;

// Plano de subida por número. Desligado. Quem muda LIMITE_DIA é o Salomão.
// Parar e não subir se houver bloqueio, denúncia ou 2 pedidos de parada no dia.
export const PLANO_SUBIDA = Object.freeze([
  Object.freeze({ porDia: 10, porHora: 3 }),
  Object.freeze({ porDia: 20, porHora: 4 }),
  Object.freeze({ porDia: 40, porHora: 6 }),
]);

export function subidaLigada() {
  return false;
}

export function tetoVigente() {
  return { dia: LIMITE_DIA, hora: LIMITE_HORA, subida: 'desligada' };
}

export function motivoPararSubida(sinais = {}) {
  if (sinais.bloqueio) return 'bloqueio';
  if (sinais.denuncia) return 'denuncia';
  if ((sinais.paradasNoDia || 0) >= 2) return '2_paradas';
  return '';
}

export function intervaloCampanha(aleatorio = Math.random) {
  const n = Number(aleatorio());
  const faixa = INTERVALO_MAX - INTERVALO_MIN + 1;
  const sorteio = Number.isFinite(n) ? n : 0;
  return INTERVALO_MIN + Math.min(faixa - 1, Math.max(0, Math.floor(sorteio * faixa)));
}

/** Dias úteis (seg–sex) estritamente depois da data de envio, em Brasília, até hoje inclusive. */
export function diasUteisDepois(emIso, agora = new Date()) {
  const fim = relogioSP(agora).data;
  const inicio = relogioSP(new Date(emIso)).data;
  if (!inicio || !fim || fim <= inicio) return 0;
  let n = 0;
  let [y, m, d] = inicio.split('-').map(Number);
  for (let i = 0; i < 21; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = dt.getUTCDay();
    if (dow >= 1 && dow <= 5) n += 1;
    if (iso >= fim) break;
  }
  return n;
}

export function retornoDevido(item, agora = new Date()) {
  if (!item || item.status !== 'enviado' || item.followup_em || item.respondeu) return false;
  if (!item.em) return false;
  return diasUteisDepois(item.em, agora) >= 2;
}

export function elegivelCampanha(lead, estado, agora = new Date()) {
  const item = estado?.itens?.[lead.id];
  if (!item) return true;
  if (item.status === 'pulado' || item.status === 'erro') return false;
  return retornoDevido(item, agora);
}

/**
 * No máximo 1 envio. Retorno (2º toque) vem na frente de empresa nova, dentro do mesmo teto.
 */
export function decidirCampanha({ agora = new Date(), estado = {}, fila = [], freio = null, evolutionAberta = true } = {}) {
  const retornos = [];
  const novos = [];
  for (const lead of fila) {
    if (retornoDevido(estado.itens?.[lead.id], agora)) retornos.push(lead);
    else if (!estado.itens?.[lead.id]) novos.push(lead);
  }
  const ordem = [...retornos, ...novos];
  const d = decidir({
    agora,
    estado,
    fila: ordem,
    freio,
    evolutionAberta,
    limiteDia: LIMITE_DIA,
    limiteHora: LIMITE_HORA,
    idDe: (p) => p.id,
    elegivel: (p, est) => elegivelCampanha(p, est, agora),
  });
  if (d.acao !== 'enviar') return d;
  const toque = retornoDevido(estado.itens?.[d.pessoa.id], agora) ? 2 : 1;
  return { ...d, toque };
}
