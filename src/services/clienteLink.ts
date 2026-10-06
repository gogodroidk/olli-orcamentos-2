import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, getCurrentUser } from './supabase';
import { LINK_BASE_URL } from '../config';
import { track, Eventos } from './analytics';
import { Orcamento, Empresa, StatusOrcamento, OrcamentoVersao, EventoTrilhaCliente } from '../types';
import { generateId } from '../utils/id';
import {
  getOrcamento,
  saveOrcamento,
  upsertVersaoLocalSilencioso,
  proximoNumeroVersao,
  getVersoesPendentesEspelho,
  marcarVersaoEspelhoConcluido,
  getRecibos,
} from '../database/database';
import { totalRecebidoDoOrcamento } from './pagamentos';
import { nowISO } from '../utils/date';
import { cobrancaDoLink } from '../utils/cobrancaCliente';
import type { RespostaDoLink } from './followUpLembretesRegra';
import { conteudoDoLink, gerarTokenLink } from './clienteLinkSnapshot';

const TABLE = 'orcamentos_publicos';
const TABLE_VERSOES = 'orcamento_versoes';

/** O link do cliente exige nuvem configurada (login) + domínio do Worker. */
export function linkConfigurado(): boolean {
  return !!supabase && !!LINK_BASE_URL;
}

function novoToken(): string {
  return gerarTokenLink(generateId);
}



/**
 * Quanto já foi recebido deste orçamento (recibos não estornados), ou `null` se a
 * leitura falhou. `null` NÃO é zero: com ele a página deixa de mostrar o Pix, em vez
 * de cobrar o total de quem talvez já tenha pago a entrada.
 */
async function recebidoDoOrcamento(orcamentoId: string): Promise<number | null> {
  try {
    return totalRecebidoDoOrcamento(orcamentoId, await getRecibos());
  } catch {
    return null;
  }
}


/**
 * Token do link que este orçamento já tem, `null` se ainda não tem. Erro de leitura
 * LANÇA: "não consegui ver" não pode virar "não existe" — senão nasce um SEGUNDO link
 * (status 'enviado') e o cliente que já aprovou no primeiro vê o pedido de aprovação
 * de novo no segundo.
 */
async function tokenExistente(orcamentoId: string, userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('token')
    .eq('orcamento_id', orcamentoId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.token ?? null;
}

/**
 * Publica o orçamento e devolve o link público (Etapa 3). Reaproveita o token
 * se o orçamento já tiver sido enviado antes, para o link não mudar.
 */
export async function gerarLinkOrcamento(orc: Orcamento, empresa: Empresa | null): Promise<string> {
  if (!supabase) throw new Error('Ative o backup na nuvem (tela Conta) para gerar o link do cliente.');
  if (!LINK_BASE_URL) throw new Error('Configure o domínio do link em EXPO_PUBLIC_LINK_BASE_URL.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Faça login (tela Conta) para gerar o link do cliente.');

  const cobranca = cobrancaDoLink(orc, await recebidoDoOrcamento(orc.id));
  // Conteúdo do link SEM o status: o status é a resposta do CLIENTE e só o worker o
  // escreve (aprovar/recusar). Republicar o snapshot não pode mexer nele.
  const conteudo = conteudoDoLink(orc, empresa, cobranca);
  const baseRow = { user_id: user.id, orcamento_id: orc.id, ...conteudo, status: 'enviado' };

  const reusado = await tokenExistente(orc.id, user.id);
  let token = '';

  if (reusado) {
    // Token já existe: atualiza SÓ o snapshot (link não muda). Antes era um upsert com
    // status 'enviado' — reenviar o link ou gerar o PDF depois da aprovação voltava o
    // link para "enviado": o Pix sumia e o cliente tinha de aprovar de novo.
    const { data, error } = await supabase
      .from(TABLE)
      .update(conteudo)
      .eq('token', reusado)
      .eq('user_id', user.id)
      .select('token');
    if (error) throw error;
    if (Array.isArray(data) && data.length > 0) token = reusado;
    // 0 linhas: a linha sumiu entre a leitura e a escrita — cai na criação abaixo.
  }

  if (!token) {
    // Token NOVO: insere e, na colisão de PK (token já usado por outro registro),
    // gera outro e tenta de novo (1-2 retries). Com 128 bits a colisão é
    // praticamente impossível, mas tratamos para nunca sobrescrever outro link.
    let inserido = false;
    let ultimoErro: any = null;
    for (let tentativa = 0; tentativa < 3 && !inserido; tentativa++) {
      token = novoToken();
      const { error } = await supabase.from(TABLE).insert({ token, ...baseRow });
      if (!error) {
        inserido = true;
        break;
      }
      ultimoErro = error;
      // 23505 = unique_violation (PK token). Só nesse caso vale tentar outro token.
      if ((error as any)?.code !== '23505') throw error;
    }
    if (!inserido) throw ultimoErro ?? new Error('Não foi possível gerar o link do cliente.');
  }

  track(Eventos.quoteSent, { numero: orc.numero });
  return `${LINK_BASE_URL}/o/${token}`;
}

/**
 * Lê o estado atual do link de um orçamento: status (enviado/visualizado/aprovado/
 * recusado), quando respondeu, quando visualizou e o motivo/mensagem do cliente
 * (só em recusa). `visualizado_em` pode não existir em bancos antigos — o
 * `select` tolera via fallback (ver `lerLinkRow`). NUNCA lança (retorna null).
 */
export async function statusDoLink(orcamentoId: string): Promise<{
  status: string;
  respondidoEm?: string;
  visualizadoEm?: string;
  motivo?: string;
  pagamentoInformadoEm?: string;
} | null> {
  try {
    if (!supabase) return null;
    const user = await getCurrentUser();
    if (!user) return null;
    const row = await lerLinkRow(orcamentoId, user.id);
    if (!row) return null;
    return {
      status: row.status,
      respondidoEm: row.respondidoEm,
      visualizadoEm: row.visualizadoEm,
      motivo: row.motivo,
      pagamentoInformadoEm: row.pagamentoInformadoEm,
    };
  } catch {
    return null;
  }
}

/**
 * Forma normalizada de UMA linha de `orcamentos_publicos` para leitura da trilha.
 * `visualizadoEm`/`motivo` podem faltar (banco antigo / sem resposta).
 */
interface LinkRow {
  status: string;
  respondidoEm?: string;
  visualizadoEm?: string;
  motivo?: string;
  /** Quando o cliente tocou "Já paguei" no link (aviso, não confirmação). */
  pagamentoInformadoEm?: string;
}

/** Marca de "a leitura FALHOU" (rede, RLS, backend) — diferente de "não há link". */
const FALHA_LEITURA_LINK = Symbol('falha_leitura_link');

/**
 * Lê a linha do link de um orçamento com resiliência a schema: tenta o SELECT
 * completo (com `visualizado_em`); se a coluna ainda não existir na nuvem (erro
 * 42703 "column does not exist"), refaz o SELECT sem ela. Assim o app não quebra
 * antes de a migration 20260708_versoes.sql ser aplicada. NUNCA lança.
 */
async function lerLinkRow(orcamentoId: string, userId: string): Promise<LinkRow | null> {
  const r = await lerLinkRowOuFalha(orcamentoId, userId);
  return r === FALHA_LEITURA_LINK ? null : r;
}

/**
 * Mesma leitura de `lerLinkRow`, com TRÊS respostas (nunca colapsar erro em
 * vazio): a linha, `null` (não há link) ou `FALHA_LEITURA_LINK` (não deu para
 * ler). É o que permite à linha do tempo dizer "não deu para consultar" em vez
 * de "o cliente não abriu". NUNCA lança.
 */
async function lerLinkRowOuFalha(orcamentoId: string, userId: string): Promise<LinkRow | null | typeof FALHA_LEITURA_LINK> {
  if (!supabase) return null;
  // 0ª tentativa: com pagamento_informado_em ("Já paguei" do cliente, migration
  // 20260930120300). Sem a coluna (42703), segue a escada antiga abaixo.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('status, respondido_em, resposta_cliente, visualizado_em, pagamento_informado_em')
      .eq('orcamento_id', orcamentoId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!error) return data ? normalizarLinkRow(data) : null;
    if ((error as any)?.code && (error as any).code !== '42703') return FALHA_LEITURA_LINK;
  } catch {
    // cai para a escada antiga
  }
  // 1ª tentativa: com visualizado_em.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('status, respondido_em, resposta_cliente, visualizado_em')
      .eq('orcamento_id', orcamentoId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!error && data) return normalizarLinkRow(data);
    if (error && (error as any)?.code && (error as any).code !== '42703') return FALHA_LEITURA_LINK;
  } catch {
    // cai para o fallback abaixo
  }
  // 2ª tentativa (fallback): sem visualizado_em (coluna ausente em banco antigo).
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('status, respondido_em, resposta_cliente')
      .eq('orcamento_id', orcamentoId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (error) return FALHA_LEITURA_LINK;
    return data ? normalizarLinkRow(data) : null;
  } catch {
    return FALHA_LEITURA_LINK;
  }
}

function normalizarLinkRow(data: any): LinkRow {
  return {
    status: data.status,
    respondidoEm: data.respondido_em ?? undefined,
    visualizadoEm: data.visualizado_em ?? undefined,
    // resposta_cliente do worker = mensagem/motivo do cliente (LGPD: texto livre
    // que o próprio cliente digitou; não logamos, só exibimos para o dono).
    motivo: data.resposta_cliente ?? undefined,
    pagamentoInformadoEm: data.pagamento_informado_em ?? undefined,
  };
}

/**
 * Sincroniza no banco LOCAL a EVOLUÇÃO do cliente no link público — visualização
 * (enviado → visualizado) e resposta (→ aprovado/recusado). Faz UMA consulta em
 * lote na tabela `orcamentos_publicos` (RLS já restringe ao dono logado) trazendo
 * TODOS os links do dono, e atualiza o status do orçamento local quando ele deve
 * avançar, sem NUNCA reverter uma decisão manual do dono (ver `statusLocalAlvo`).
 * O motivo da recusa NÃO é gravado no orçamento: fica na trilha (ver `trilhaDoLink`).
 *
 * Também dispara a notificação local "Cliente aprovou"/"Cliente recusou" UMA vez
 * por orçamento (`followUpLembretes.avisarRespostasDoCliente`, dedupe persistido)
 * — qualquer chamador (pull do cloudSync, foco da lista, detalhe) leva ao mesmo
 * aviso, e o segundo a ver a mesma resposta não avisa de novo.
 *
 * Retorna QUANTOS orçamentos mudaram de status. NUNCA lança: offline, deslogado,
 * sem nuvem ou qualquer erro de rede/backend resultam em 0 (no-op silencioso),
 * para poder ser chamada em background (ex.: ao focar a lista de orçamentos).
 * Leitura que FALHOU não chama o aviso (não é "nenhum link respondido").
 */
export async function sincronizarStatusLinks(): Promise<number> {
  try {
    if (!supabase) return 0;
    const user = await getCurrentUser();
    if (!user) return 0;

    // Traz TODOS os links do dono (não só os respondidos) para também captar a
    // VISUALIZAÇÃO (mestre 13). Schema-resiliente: tenta com `visualizado_em`; se a
    // coluna ainda não existe (migration não aplicada), refaz sem ela.
    const rows = await lerLinksDoDonoOuNull(user.id);
    if (rows === null) return 0; // leitura falhou: nada a aplicar nem a avisar

    let mudaram = 0;
    const respostas: RespostaDoLink[] = [];
    for (const row of rows) {
      try {
        if (!row.orcamentoId) continue;
        // Atalho barato: um link ainda em 'enviado' e SEM sinal de visualização/
        // resposta não tem nada a aplicar → evita o getOrcamento (leitura no SQLite).
        if (row.status === 'enviado' && !row.visualizadoEm) continue;

        const orc = await getOrcamento(row.orcamentoId);
        if (row.status === 'aprovado' || row.status === 'recusado') {
          respostas.push({
            orcamentoId: row.orcamentoId,
            status: row.status,
            respondidoEm: row.respondidoEm,
            orcamento: orc ?? null,
          });
        }
        if (!orc) continue; // orçamento pode ter sido excluído localmente

        const alvo = statusLocalAlvo(orc.status, row);
        if (!alvo || alvo === orc.status) continue;

        // Espelha a evolução do cliente no orçamento local (saveOrcamento replica
        // para a nuvem/painel). Bump em atualizadoEm como no fluxo manual. Mudar
        // SÓ o status (mesmo conteúdo comercial) NÃO gera versão — a regra de ouro
        // do saveOrcamento compara a impressão comercial, imune à troca de status.
        // A decisão do cliente tem hora: `respondido_em` do link. Informada aqui, o
        // `carimbarDecisao` do save a respeita (sem ela, valeria a hora deste sync).
        const decididoEm =
          (alvo === 'aprovado' || alvo === 'recusado') && row.respondidoEm && Number.isFinite(new Date(row.respondidoEm).getTime())
            ? new Date(row.respondidoEm).toISOString()
            : undefined;
        await saveOrcamento({ ...orc, status: alvo, atualizadoEm: nowISO(), ...(decididoEm ? { decididoEm } : {}) });
        mudaram++;
      } catch {
        // pula linha problemática, segue o resto
      }
    }
    // Aviso "Cliente aprovou/recusou", uma vez por orçamento. Import tardio: este
    // módulo também roda no painel web e não deve carregar expo-notifications à toa.
    const idsComLink = rows.map((r) => r.orcamentoId).filter((id): id is string => !!id);
    await import('./followUpLembretes')
      .then((m) => m.avisarRespostasDoCliente(user.id, respostas, idsComLink))
      .catch(() => 0);
    return mudaram;
  } catch {
    // nunca lança: qualquer falha vira 0 (offline/erro)
    return 0;
  }
}

/**
 * orcamentoId → ISO de quando o cliente tocou "Já paguei" no link público.
 *
 * É AVISO do cliente, nunca confirmação: o radar de cobrança mostra "cliente avisou
 * que pagou — confira" e quem registra o pagamento é o prestador, depois de ver o
 * dinheiro no banco. Por isso esta leitura NÃO muda status nem cria recibo.
 *
 * NUNCA lança. Falha/offline/banco sem a coluna = mapa vazio: o radar só deixa de
 * mostrar o aviso (o orçamento continua na lista de cobrança — nenhum dinheiro some).
 */
export async function pagamentosInformadosPeloCliente(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    if (!supabase) return mapa;
    const user = await getCurrentUser();
    if (!user) return mapa;
    for (const row of (await lerLinksDoDonoOuNull(user.id)) ?? []) {
      if (row.orcamentoId && row.pagamentoInformadoEm) mapa.set(row.orcamentoId, row.pagamentoInformadoEm);
    }
  } catch {
    // aviso é best-effort
  }
  return mapa;
}

/** Linha de link do dono, já normalizada, para o batch de sincronização. */
interface LinkDonoRow extends LinkRow {
  orcamentoId?: string;
}

/**
 * Lê em LOTE todos os links do dono com resiliência de schema (com/sem
 * `visualizado_em`). RLS já restringe ao dono; o `.eq('user_id')` é defensivo.
 * NUNCA lança. Falha de leitura = `null` (NÃO `[]`): "não consegui ler" é
 * diferente de "não há links" — o aviso de resposta depende dessa diferença.
 */
async function lerLinksDoDonoOuNull(userId: string): Promise<LinkDonoRow[] | null> {
  if (!supabase) return null;
  const mapear = (arr: any[]): LinkDonoRow[] =>
    arr.map((r) => ({ orcamentoId: r?.orcamento_id ?? undefined, ...normalizarLinkRow(r) }));
  // 0ª tentativa: com pagamento_informado_em (migration 20260930120300); sem a
  // coluna (42703), segue a escada antiga.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('orcamento_id, status, respondido_em, resposta_cliente, visualizado_em, pagamento_informado_em')
      .eq('user_id', userId);
    if (!error && Array.isArray(data)) return mapear(data);
    if (error && (error as any)?.code && (error as any).code !== '42703') return null;
  } catch {
    // cai para a escada antiga
  }
  // 1ª tentativa: com visualizado_em.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('orcamento_id, status, respondido_em, resposta_cliente, visualizado_em')
      .eq('user_id', userId);
    if (!error && Array.isArray(data)) return mapear(data);
    if (error && (error as any)?.code && (error as any).code !== '42703') return null;
  } catch {
    // cai para o fallback
  }
  // 2ª tentativa (fallback): sem visualizado_em.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('orcamento_id, status, respondido_em, resposta_cliente')
      .eq('user_id', userId);
    if (error || !Array.isArray(data)) return null;
    return mapear(data);
  } catch {
    return null;
  }
}

/**
 * Decide o status LOCAL alvo a partir do estado do link na nuvem, respeitando a
 * decisão do DONO (nunca reverte uma mudança manual). Regras:
 *  - aprovado/recusado na nuvem: só aplica se o local ainda está pré-resposta
 *    (enviado/visualizado). Se o dono já moveu para cancelado/aguardando/terminal
 *    à mão, a decisão local é mais recente e vence (evita loop de reversão).
 *  - visualizado (status 'visualizado' OU carimbo visualizado_em): só PROMOVE de
 *    'enviado' → 'visualizado'. Nunca rebaixa um estado mais avançado.
 * Devolve null quando não há transição a aplicar.
 */
function statusLocalAlvo(statusLocal: StatusOrcamento, link: LinkDonoRow): StatusOrcamento | null {
  const s = link.status;
  if (s === 'aprovado' || s === 'recusado') {
    // Só sobrescreve estados pré-resposta; qualquer outro = decisão manual do dono.
    if (statusLocal === 'enviado' || statusLocal === 'visualizado') return s;
    return null;
  }
  const visualizou = s === 'visualizado' || !!link.visualizadoEm;
  if (visualizou && statusLocal === 'enviado') return 'visualizado';
  return null;
}

/**
 * Monta a TRILHA do cliente (mestre 13) de um orçamento a partir da linha do link
 * na nuvem: enviado → visualizado → aprovado/recusado (com motivo, se recusou). É
 * uma leitura VIVA (não persistida no orçamento) — a tela chama no foco. Ordem
 * cronológica (mais antigo → mais recente).
 *
 * Três respostas, nunca duas: lista de eventos; `[]` quando o orçamento nunca teve
 * link, não há nuvem ou ninguém está logado; e REJEITA quando a leitura falhou
 * (rede, backend). Antes a falha também virava `[]` e a tela dizia, sem saber, que
 * o cliente não tinha aberto. LGPD: o `motivo` é texto que o próprio cliente
 * digitou; devolvido só para exibição ao dono, jamais logado.
 */
export async function trilhaDoLink(orcamentoId: string): Promise<EventoTrilhaCliente[]> {
  if (!supabase) return [];
  const user = await getCurrentUser();
  if (!user) return [];
  const link = await lerLinkRowOuFalha(orcamentoId, user.id);
  if (link === FALHA_LEITURA_LINK) throw new Error('Não deu para consultar o link do cliente agora.');
  if (!link) return [];
  const eventos: EventoTrilhaCliente[] = [];
  // 'enviado': a existência da linha do link já significa que a proposta foi
  // publicada. Sem carimbo próprio de envio na tabela, deixamos `em` indefinido.
  eventos.push({ tipo: 'enviado' });
  if (link.visualizadoEm) {
    eventos.push({ tipo: 'visualizado', em: link.visualizadoEm });
  } else if (link.status === 'visualizado' || link.status === 'aprovado' || link.status === 'recusado') {
    // O cliente respondeu (logo visualizou), mas o banco não tem visualizado_em
    // (worker antigo): registramos a visualização sem timestamp, para a trilha
    // não pular direto de "enviado" para a resposta.
    eventos.push({ tipo: 'visualizado' });
  }
  if (link.status === 'aprovado') {
    eventos.push({ tipo: 'aprovado', em: link.respondidoEm });
  } else if (link.status === 'recusado') {
    eventos.push({ tipo: 'recusado', em: link.respondidoEm, motivo: link.motivo });
  }
  // "Já paguei" do cliente — aviso para o prestador conferir, não baixa de pagamento.
  if (link.pagamentoInformadoEm) {
    eventos.push({ tipo: 'pagamento_informado', em: link.pagamentoInformadoEm });
  }
  return eventos;
}

/**
 * Escuta (Supabase Realtime, plano gratuito) as mudanças na linha do link deste
 * orçamento: o cliente abriu, aprovou, recusou ou avisou que pagou. Cada mudança
 * chama `aoMudar` — a tela relê o status e a trilha do jeito de sempre; o payload
 * do evento NÃO é usado como dado (a fonte continua sendo a leitura com RLS).
 *
 * Complemento, não dependência: sem a migration 20261001150000 (tabela fora da
 * publicação), sem nuvem ou sem login, simplesmente não chega evento e a tela
 * segue atualizando no foco e no "puxar para atualizar". Por isso nenhum texto
 * do app promete "ao vivo". Devolve a função que cancela a escuta. NUNCA lança.
 */
let escutasDoLink = 0;

export function escutarMudancasDoLink(orcamentoId: string, aoMudar: () => void): () => void {
  const cliente = supabase;
  if (!cliente || !orcamentoId) return () => {};
  let canal: ReturnType<SupabaseClient['channel']> | null = null;
  try {
    // Tópico único por escuta: o mesmo orçamento aberto duas vezes na pilha não
    // reaproveita (nem derruba, ao sair) o canal da outra tela.
    escutasDoLink += 1;
    canal = cliente
      .channel(`orcamento-link-${orcamentoId}-${escutasDoLink}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `orcamento_id=eq.${orcamentoId}` },
        () => aoMudar(),
      )
      .subscribe();
  } catch {
    canal = null;
  }
  return () => {
    if (!canal) return;
    const c = canal;
    canal = null;
    cliente.removeChannel(c).catch(() => {});
  };
}

/**
 * Espelha UMA versão de orçamento na nuvem (public.orcamento_versoes). Chamado
 * pelo database.ts (import dinâmico) quando uma versão é congelada.
 *
 * Idempotência por `id` (mesmo aparelho re-espelhando a MESMA versão = upsert
 * limpo). MAS a colisão real entre APARELHOS é na UNIQUE(orcamento_id,
 * numero_versao): dois aparelhos offline podem congelar a "vN" com `id` diferente;
 * ao subir, o segundo leva 23505 nessa constraint. Em vez de engolir (o snapshot
 * sumiria), RENUMERAMOS para o próximo número livre (MAX local + 1) e tentamos UMA
 * vez mais — e propagamos o novo número para o SQLite local (mesmo `id`), para os
 * dois aparelhos convergirem sem exibir "vN" duplicada. O upload é disparado
 * em background, mas a versão fica numa outbox SQLite até a confirmação; assim
 * offline/deslogado/sem-nuvem não perde o trabalho. NUNCA lança.
 *
 * P1-4: membro não-dono (técnico) precisa gravar a versão no tenant do DONO —
 * senão o snapshot nasce com user_id dele (default da coluna) e o dono nunca o vê.
 * Mesmo padrão do cloudSync (`contextoEquipeOwner`): resolve a org via
 * `getMinhaOrganizacao()` e só inclui `user_id` no payload quando o usuário é
 * membro não-dono — a RLS de INSERT de `orcamento_versoes` já aceita
 * `user_id in donos_visiveis()` (20260708_versoes.sql), só faltava o app mandar.
 */
export async function espelharVersaoNuvem(versao: OrcamentoVersao): Promise<boolean> {
  try {
    if (!supabase || !versao?.id) return false;
    const user = await getCurrentUser();
    if (!user) return false;

    // Import dinâmico (mesmo motivo do cloudSync): evita aresta estática entre
    // clienteLink e sync.
    //
    // FOLLOWUPS #29 — aqui usava `getMinhaOrganizacao()`, que colapsa erro em `null`,
    // e o comentário antigo racionalizava: "o pior caso é gravar no próprio tenant
    // (comportamento de hoje), nunca vazamento". Não é vazamento, mas é EXATAMENTE o
    // P1-4 que esta função existe para evitar: a versão nasce com o `user_id` do
    // técnico, o dono nunca a vê, e ela fica ÓRFÃ — apontando para um orçamento que
    // mora no tenant do dono. Uma oscilação de rede bastava.
    //
    // Agora são 3 estados (mesma primitiva do cloudSync). `desconhecido` NÃO espelha.
    // Isso é estritamente melhor do que era: antes, o erro criava uma linha ERRADA na
    // nuvem (invisível para o dono e poluindo o tenant do técnico); agora não cria
    // linha nenhuma — o dono continua sem ver, mas nada errado é gravado, e o SQLite
    // local segue com a versão.
    //
    const decisao = await (async () => {
      try {
        const { garantirContextoEquipe } = await import('./cloudSync');
        const { decidirEscritaEquipe } = await import('./contextoEquipe');
        return decidirEscritaEquipe(await garantirContextoEquipe());
      } catch {
        return { adiar: true } as const;
      }
    })();
    if (decisao.adiar) return false; // não sabemos o tenant: não chuta
    const ownerUserId = decisao.userIdOverride;

    const payload = (numeroVersao: number) => {
      const linha: Record<string, unknown> = {
        id: versao.id,
        orcamento_id: versao.orcamentoId,
        numero_versao: numeroVersao,
        dados: versao.dados,
        criado_em: versao.criadoEm,
      };
      // Só sobrescreve user_id quando o técnico grava em nome do dono; dono sozinho
      // continua sem enviar a coluna (default auth.uid() da tabela cuida disso).
      if (ownerUserId) linha.user_id = ownerUserId;
      return linha;
    };

    const { error } = await supabase
      .from(TABLE_VERSOES)
      .upsert(payload(versao.numeroVersao), { onConflict: 'id' });
    if (!error) {
      await marcarVersaoEspelhoConcluido(versao.id);
      return true;
    }

    // 23505 = unique_violation. Como o upsert é por `id`, uma colisão aqui só pode
    // ser na UNIQUE(orcamento_id, numero_versao) — esse número já foi usado por
    // OUTRO aparelho. Renumera para o próximo livre e re-tenta UMA vez.
    if ((error as any)?.code !== '23505') return false;
    const novoNumero = await proximoNumeroVersao(versao.orcamentoId);
    if (novoNumero === versao.numeroVersao) return false; // nada a renumerar
    const { error: erroRetry } = await supabase
      .from(TABLE_VERSOES)
      .upsert(payload(novoNumero), { onConflict: 'id' });
    if (erroRetry) return false; // ainda colidiu (corrida rara) — tenta no próximo sync
    // Sucesso na nuvem com o novo número: alinha o SQLite local (mesmo `id`) para
    // não ficar uma "vN" divergente entre local e nuvem.
    await upsertVersaoLocalSilencioso({ ...versao, numeroVersao: novoNumero });
    await marcarVersaoEspelhoConcluido(versao.id);
    return true;
  } catch {
    // espelho em background: nunca afeta o app local
    return false;
  }
}

/**
 * Drena uma fatia da outbox local. Só remove a marca pendente quando o upload
 * confirmou; contexto de equipe desconhecido, logout ou rede fora deixam a
 * linha para a próxima retomada. A partição SQLite já foi resolvida pelo
 * `syncOnLogin`, então não há mistura entre contas.
 */
export async function espelharVersoesPendentes(limite = 20): Promise<number> {
  let concluidas = 0;
  try {
    const pendentes = await getVersoesPendentesEspelho(limite);
    for (const versao of pendentes) {
      if (await espelharVersaoNuvem(versao)) concluidas++;
    }
  } catch {
    // outbox é best-effort; a marca pendente preserva a tentativa futura.
  }
  return concluidas;
}

/**
 * Puxa da nuvem as versões de UM orçamento e as grava no SQLite local (upsert
 * silencioso, sem re-espelhar). Fecha o caminho downstream: versões criadas em
 * OUTRO aparelho do mesmo dono (ou por um membro da equipe) aparecem aqui. A RLS
 * de `orcamento_versoes` já restringe ao que o usuário pode ver (dono + org).
 * Retorna quantas versões foram aplicadas localmente (0 = nada novo / offline).
 * NUNCA lança — é chamada em background ao focar a tela do orçamento.
 */
export async function puxarVersoesNuvemParaOrcamento(orcamentoId: string): Promise<number> {
  try {
    if (!supabase || !orcamentoId) return 0;
    const user = await getCurrentUser();
    if (!user) return 0;
    const { data, error } = await supabase
      .from(TABLE_VERSOES)
      .select('id, orcamento_id, numero_versao, dados, criado_em')
      .eq('orcamento_id', orcamentoId);
    if (error || !Array.isArray(data) || data.length === 0) return 0;

    let aplicadas = 0;
    for (const row of data) {
      try {
        const dados = (row as any)?.dados;
        if (!dados || typeof dados !== 'object') continue; // snapshot inválido → pula
        await upsertVersaoLocalSilencioso({
          id: (row as any).id,
          orcamentoId: (row as any).orcamento_id,
          numeroVersao: (row as any).numero_versao,
          dados: dados as Orcamento,
          criadoEm: (row as any).criado_em,
        });
        aplicadas++;
      } catch {
        // pula linha problemática
      }
    }
    return aplicadas;
  } catch {
    return 0;
  }
}
