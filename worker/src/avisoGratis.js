/**
 * Aviso aos Grátis da mudança do plano (D-2267), por e-mail (template/purpose `aviso_gratis`/`plan_change_notice`).
 *
 * O texto NÃO passa por aqui: o renderer lê `avisoMudancaGratis(preço)` de src/services/planosBase.ts e o preço de
 * PRECO_PRO. Aqui só se DECIDE quem recebe e se enfileira, em lotes pequenos. Padrão = ENSAIO (não grava nada).
 * Ordem dos portões (cada conta recebe o primeiro motivo que a barra): conta_indisponivel, suprimido (e-mail OU
 * WhatsApp, por conta ou telefone), excluido (funil_exclusoes/conta interna), nao_e_gratis (plano efetivo pago ou
 * teste Pro ativo), ja_avisado. O banco repete os portões sob trava e ainda aplica 1 e-mail/24 h e o teto diário
 * (enqueue_aviso_gratis). Saída só com CONTAGENS: nunca e-mail, nome ou id de conta.
 */
import { chamarRpcServico } from './emailRpc.js';
import { AVISO_GRATIS_TIPO } from './emailLembretesTemplate.js';

export const AVISO_GRATIS_VERSION = '2026-11-18.v1';
export const AVISO_GRATIS_DADOS = Object.freeze({ tipo: AVISO_GRATIS_TIPO });
export const AVISO_GRATIS_LOTE_PADRAO = 20;
export const AVISO_GRATIS_LOTE_MAX = 50;
const FATOS_POR_CHAMADA = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Política pura: dado o que o banco diz da conta, devolve o motivo que a barra, ou 'sairia'. */
export function decidirAviso(fato) {
  if (!fato || fato.existe !== true) return 'conta_indisponivel';
  if (fato.suprimido !== false) return 'suprimido';
  if (fato.excluido !== false) return 'excluido';
  if (fato.plano !== 'gratis') return 'nao_e_gratis';
  if (fato.avisoEnviadoEm) return 'ja_avisado';
  return 'sairia';
}

/**
 * `enviar: false` (padrão) = ensaio: lista quem sairia e por quê; não chama o enqueue.
 * `enviar: true` enfileira só quem a política deixa passar, no máximo `lote` por execução (o resto sai na próxima:
 * rodar de novo é seguro, o banco devolve ja_avisado/duplicado/recebeu_email_24h/teto_diario).
 */
export async function executarAvisoGratis(env, { enviar = false, lote = AVISO_GRATIS_LOTE_PADRAO, fetchImpl = fetch, now = () => new Date(), tetoDiario = 40, limiteContas = 500 } = {}) {
  if (!Number.isInteger(lote) || lote < 1 || lote > AVISO_GRATIS_LOTE_MAX) {
    throw Object.assign(new Error('lote_invalido'), { codigo: 'lote_invalido' });
  }
  const config = {
    supabaseUrl: String(env?.SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
    serviceRoleKey: String(env?.SUPABASE_SERVICE_ROLE_KEY ?? '').trim(),
  };
  if (!/^https:\/\/[^/]+/.test(config.supabaseUrl) || config.serviceRoleKey.length < 20) {
    throw Object.assign(new Error('supabase_nao_configurado'), { codigo: 'supabase_nao_configurado' });
  }
  const agora = now();
  const contas = await chamarRpcServico(config, fetchImpl, 'contas_para_aviso_gratis', { p_limit: limiteContas });
  if (!Array.isArray(contas)) throw Object.assign(new Error('contas_resposta_invalida'), { codigo: 'contas_resposta_invalida' });
  const ids = [...new Set(contas.map((c) => String(c?.user_id ?? '').toLowerCase()).filter((id) => UUID_RE.test(id)))];

  const fatos = new Map();
  for (let i = 0; i < ids.length; i += FATOS_POR_CHAMADA) {
    const linhas = await chamarRpcServico(config, fetchImpl, 'fatos_aviso_gratis', {
      p_user_ids: ids.slice(i, i + FATOS_POR_CHAMADA),
      p_now: agora.toISOString(),
    });
    if (!Array.isArray(linhas)) throw Object.assign(new Error('fatos_resposta_invalida'), { codigo: 'fatos_resposta_invalida' });
    for (const l of linhas) fatos.set(String(l?.fato?.userId ?? '').toLowerCase(), l?.fato);
  }

  const contagens = {};
  const somar = (motivo) => { contagens[motivo] = (contagens[motivo] || 0) + 1; };
  let tentados = 0;
  for (const id of ids) {
    let motivo = decidirAviso(fatos.get(id));
    if (motivo === 'sairia' && enviar) {
      if (tentados >= lote) {
        motivo = 'fica_para_o_proximo_lote';
      } else {
        tentados += 1;
        // Erro numa conta não derruba o relatório: as outras seguem e a contagem mostra o erro.
        try {
          const r = await chamarRpcServico(config, fetchImpl, 'enqueue_aviso_gratis', {
            p_user_id: id,
            p_template_dados: AVISO_GRATIS_DADOS,
            p_teto_diario: tetoDiario,
            p_now: agora.toISOString(),
          });
          motivo = r && r.enfileirado === true ? 'enfileirado' : String(r?.motivo ?? 'resposta_invalida').replace(/[^a-z_0-9]/g, '').slice(0, 40);
        } catch {
          motivo = 'erro_rpc';
        }
      }
    }
    somar(motivo);
  }
  return Object.freeze({ version: AVISO_GRATIS_VERSION, modo: enviar ? 'envio' : 'ensaio', lote: enviar ? lote : null, total: ids.length, contagens });
}
