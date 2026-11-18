/**
 * Oferta do plano Pro por e-mail (template/purpose `oferta_pro`), por LISTA EXPLÍCITA de user_ids.
 *
 * Mesmo caminho dos lembretes: outbox -> consumer (link de descadastro assinado + List-Unsubscribe) ->
 * Resend. Aqui só se DECIDE e se enfileira; nada é enviado daqui. Padrão = ENSAIO (não grava nada).
 * Ordem dos portões (cada conta recebe o primeiro motivo que a barra): conta_indisponivel, suprimido,
 * excluido (funil_exclusoes/conta interna), membro_equipe (convidado de outra organização), ja_assinou
 * (assinatura ativa, atrasada ou cancelada), nao_e_gratis (pago OU teste Pro ativo), oferta_recente
 * (já recebeu `oferta_pro` nos últimos 30 dias). O banco repete os portões sob trava (enqueue_oferta_pro).
 * Saída só com contagens e user_id (nunca e-mail ou texto).
 */
import { chamarRpcServico } from './emailRpc.js';
import { CONVERSA_LIMITES, OFERTA_PRO_LIMITES } from './emailLembretesTemplate.js';

export const OFERTA_PRO_VERSION = '2026-11-08.v1';
export const OFERTA_PRO_MAX_CONTAS = 50;
export const OFERTA_PRO_MAX_BYTES = 5500;
export const MODELOS = Object.freeze({
  /** Oferta do Pro (botão "Ver o plano Pro"): padrão, comportamento de sempre. */
  oferta_pro: Object.freeze({ fatosRpc: 'fatos_oferta_pro', enqueueRpc: 'enqueue_oferta_pro', recente: 'ofertaRecenteEm', motivoRecente: 'oferta_recente', limites: OFERTA_PRO_LIMITES, maxBytes: OFERTA_PRO_MAX_BYTES }),
  /** Conversa (D-2233): tom de vendedor humano, sem botão de plano, para G1/G2. */
  conversa: Object.freeze({ fatosRpc: 'fatos_conversa', enqueueRpc: 'enqueue_conversa', recente: 'conversaRecenteEm', motivoRecente: 'conversa_recente', limites: CONVERSA_LIMITES, maxBytes: CONVERSA_LIMITES.bytes }),
});
/**
 * Frases que o Igor proibiu no texto de venda (D-2233) e o que não é verdade hoje. Só o modelo `conversa`
 * confere (o `oferta_pro` antigo segue como está). Comparação sem acento e sem caixa.
 */
export const FRASES_PROIBIDAS = Object.freeze([
  'quer continuar', 'responda sair', 'digite sair', 'preco da tabela', 'sem desconto', 'bateu o limite',
  'bateu o teto', 'sem cota', 'ilimitado', 'sem limite',
]);
const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida a lista: [{ userId, assunto, paragrafos[] }]. Falha fechado (lança) em qualquer item torto. */
export function validarOfertas(ofertas, modelo = 'oferta_pro') {
  const M = MODELOS[modelo];
  if (!M) throw Object.assign(new Error('modelo_invalido'), { codigo: 'modelo_invalido' });
  const falha = (codigo) => { throw Object.assign(new Error(codigo), { codigo }); };
  if (!Array.isArray(ofertas) || ofertas.length < 1 || ofertas.length > OFERTA_PRO_MAX_CONTAS) falha('lista_invalida');
  const vistos = new Set();
  return ofertas.map((o) => {
    const userId = typeof o?.userId === 'string' ? o.userId.toLowerCase() : '';
    if (!UUID_RE.test(userId) || vistos.has(userId)) falha('user_id_invalido_ou_repetido');
    vistos.add(userId);
    const { assunto, paragrafos } = o;
    if (typeof assunto !== 'string' || assunto.trim().length < 5 || assunto.length > M.limites.assunto || /[\r\n<>]/.test(assunto)) falha('assunto_invalido');
    if (!Array.isArray(paragrafos) || paragrafos.length < 1 || paragrafos.length > M.limites.paragrafos
      || paragrafos.some((p) => typeof p !== 'string' || !p.trim() || p.length > M.limites.paragrafo || /[<>]/.test(p))) falha('paragrafos_invalidos');
    const dados = { assunto: assunto.trim(), paragrafos: paragrafos.map((p) => p.trim()) };
    // O banco aceita até 6 KB em template_dados; acento ocupa 2 bytes, então a conta é em bytes, com folga.
    if (new TextEncoder().encode(JSON.stringify(dados)).length > M.maxBytes) falha('texto_grande_demais');
    if (modelo === 'conversa') {
      const tudo = semAcento([dados.assunto, ...dados.paragrafos].join(' \n '));
      if (FRASES_PROIBIDAS.some((f) => tudo.includes(f))) falha('frase_proibida');
    }
    return Object.freeze({ userId, dados });
  });
}

/** Política pura: dado o que o banco diz da conta, devolve o motivo que a barra, ou 'sairia'. */
export function decidirOferta(fato, { agora = new Date(), modelo = 'oferta_pro' } = {}) {
  const M = MODELOS[modelo];
  if (!M) throw Object.assign(new Error('modelo_invalido'), { codigo: 'modelo_invalido' });
  if (!fato || fato.existe !== true) return 'conta_indisponivel';
  if (fato.suprimido !== false) return 'suprimido';
  if (fato.excluido !== false) return 'excluido';
  if (fato.membroEquipe !== false) return 'membro_equipe';
  if (fato.jaAssinou !== false) return 'ja_assinou';
  if (fato.plano !== 'gratis') return 'nao_e_gratis';
  if (fato[M.recente]) {
    const t = new Date(fato[M.recente]).getTime();
    if (Number.isNaN(t) || agora.getTime() - t < 30 * 24 * 60 * 60 * 1000) return M.motivoRecente;
  }
  return 'sairia';
}

/**
 * `enviar: false` (padrão) = ensaio: lê fatos e lista quem sairia e por quê; não chama o enqueue.
 * `enviar: true` enfileira só quem a política deixa passar; o banco ainda reconfere cada um.
 */
export async function executarOfertaPro(env, ofertas, { enviar = false, fetchImpl = fetch, now = () => new Date(), tetoDiario = 40, modelo = 'oferta_pro' } = {}) {
  const M = MODELOS[modelo];
  if (!M) throw Object.assign(new Error('modelo_invalido'), { codigo: 'modelo_invalido' });
  const lista = validarOfertas(ofertas, modelo);
  const config = {
    supabaseUrl: String(env?.SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
    serviceRoleKey: String(env?.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  };
  if (!/^https:\/\/[^/]+/.test(config.supabaseUrl) || config.serviceRoleKey.length < 20) {
    throw Object.assign(new Error('supabase_nao_configurado'), { codigo: 'supabase_nao_configurado' });
  }
  const agora = now();
  const linhas = await chamarRpcServico(config, fetchImpl, M.fatosRpc, {
    p_user_ids: lista.map((o) => o.userId),
    p_now: agora.toISOString(),
  });
  if (!Array.isArray(linhas)) throw Object.assign(new Error('fatos_resposta_invalida'), { codigo: 'fatos_resposta_invalida' });
  const fatos = new Map(linhas.map((l) => [String(l?.fato?.userId ?? '').toLowerCase(), l?.fato]));

  const itens = [];
  for (const o of lista) {
    let motivo = decidirOferta(fatos.get(o.userId), { agora, modelo });
    if (motivo === 'sairia' && enviar) {
      // Erro numa conta não derruba o relatório: as outras seguem e a saída diz quem falhou.
      // Rodar de novo é seguro (o banco devolve duplicado/oferta_recente/recebeu_email_24h).
      try {
        const r = await chamarRpcServico(config, fetchImpl, M.enqueueRpc, {
          p_user_id: o.userId,
          p_template_dados: o.dados,
          p_teto_diario: tetoDiario,
          p_now: agora.toISOString(),
        });
        motivo = r && r.enfileirado === true ? 'enfileirado' : String(r?.motivo ?? 'resposta_invalida').replace(/[^a-z_0-9]/g, '').slice(0, 40);
      } catch {
        motivo = 'erro_rpc';
      }
    }
    itens.push({ userId: o.userId, motivo });
  }
  const contagens = {};
  for (const i of itens) contagens[i.motivo] = (contagens[i.motivo] || 0) + 1;
  return Object.freeze({ version: OFERTA_PRO_VERSION, modelo, modo: enviar ? 'envio' : 'ensaio', total: itens.length, contagens, itens });
}
