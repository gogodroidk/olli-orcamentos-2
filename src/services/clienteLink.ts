import { supabase, getCurrentUser } from './supabase';
import { LINK_BASE_URL } from '../config';
import { track, Eventos } from './analytics';
import { Orcamento, Empresa, StatusOrcamento, OrcamentoVersao, EventoTrilhaCliente } from '../types';
import { generateId } from '../utils/id';
import { getOrcamento, saveOrcamento, upsertVersaoLocalSilencioso, proximoNumeroVersao } from '../database/database';
import { nowISO } from '../utils/date';

const TABLE = 'orcamentos_publicos';
const TABLE_VERSOES = 'orcamento_versoes';

/** O link do cliente exige nuvem configurada (login) + domínio do Worker. */
export function linkConfigurado(): boolean {
  return !!supabase && !!LINK_BASE_URL;
}

/**
 * Token do link público com aleatoriedade CRIPTOGRÁFICA forte (16 bytes = 128
 * bits) — é a ÚNICA proteção do link que expõe dados do orçamento, então NÃO
 * pode ser previsível (o antigo `Math.random()`/UUID dava ~48 bits). Usa
 * `globalThis.crypto.getRandomValues` (disponível na web e no Hermes novo); cai
 * para o gerador de id só se, em algum runtime exótico, `crypto` faltar.
 * Saída: base64url SEM padding (16 bytes → 22 chars).
 */
function novoToken(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as any)?.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    // Fallback defensivo (não deve ocorrer em web/Hermes): deriva bytes do UUID.
    const hex = generateId().replace(/-/g, '');
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2) || '0', 16) & 0xff;
    }
  }
  return base64url(bytes);
}

const ALFABETO_B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Converte bytes em base64url (A–Z a–z 0–9 - _) sem padding `=`.
 *
 * Implementado em ES puro, de propósito. A versão anterior tentava `btoa`, depois
 * `Buffer`, e — se nenhum existisse — devolvia a string BINÁRIA CRUA como se fosse
 * base64: sem lançar, sem avisar, gerando um token corrompido. Nem o React Native
 * 0.85 nem nenhuma dependência instalam `btoa` ou `Buffer` como global (verificado
 * varrendo `node_modules`), então esse ramo dependia do motor. Este token é a ÚNICA
 * proteção do link que expõe dados do orçamento ao cliente: ele não pode depender de
 * o Hermes expor uma função. Base64 é aritmética de bits — trinta linhas resolvem, e
 * a pergunta "o ambiente tem btoa?" deixa de existir.
 */
function base64url(bytes: Uint8Array): string {
  let saida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    saida += ALFABETO_B64URL[b0 >> 2];
    saida += ALFABETO_B64URL[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    if (b1 === undefined) break; // 1 byte restante → 2 chars, sem padding
    saida += ALFABETO_B64URL[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    if (b2 === undefined) break; // 2 bytes restantes → 3 chars, sem padding
    saida += ALFABETO_B64URL[b2 & 0x3f];
  }
  return saida;
}

function snapshotPublico(orc: Orcamento, empresa: Empresa | null) {
  return {
    numero: orc.numero,
    clienteNome: orc.clienteNome,
    valorTotal: orc.valorTotal,
    subtotal: orc.subtotal,
    desconto: orc.desconto ?? 0,
    dataEmissao: orc.dataEmissao ?? orc.criadoEm ?? '',
    corMarca: orc.corMarca ?? '#0B6FCE',
    modeloPdf: orc.modeloPdf ?? 'editorial',
    modeloNome: orc.modeloNome ?? '',
    exibirAprovacao: orc.exibirAprovacao !== false,
    exibirRecusa: orc.exibirRecusa !== false,
    exibirAssinatura: orc.exibirAssinatura !== false,
    solicitarAssinaturaCliente: orc.solicitarAssinaturaCliente === true,
    prestador: {
      nome: empresa?.nome ?? '',
      whatsapp: empresa?.whatsapp ?? '',
      telefone: empresa?.telefone ?? '',
      // Tagline/especialidade que aparece sob o nome no cabeçalho do Link.
      tagline: empresa?.especialidade ?? empresa?.slogan ?? '',
    },
    itens: orc.itens.map(i => ({
      nome: i.nome,
      descricao: i.descricao ?? '',
      quantidade: i.quantidade,
      unidade: i.unidade,
      preco: i.preco,
      subtotal: i.subtotal,
      // Marca itens de produto/peça para o badge "PEÇA".
      isPeca: i.tipo === 'produto',
    })),
    validade: orc.validadeOrcamento ?? '',
    garantia: orc.garantia ?? '',
    condicoesPagamento: orc.condicoesPagamento ?? '',
    // "Prazo" para o mini-card (agendamento / prestação do serviço, se houver).
    prazo: orc.agendamentoServico ?? orc.dataPrestacaoServico ?? '',
  };
}

async function tokenExistente(orcamentoId: string, userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from(TABLE)
    .select('token')
    .eq('orcamento_id', orcamentoId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
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

  const baseRow = {
    user_id: user.id,
    orcamento_id: orc.id,
    numero: orc.numero,
    cliente_nome: orc.clienteNome,
    valor_total: orc.valorTotal,
    prestador_nome: empresa?.nome ?? '',
    prestador_whatsapp: (empresa?.whatsapp ?? '').replace(/\D/g, ''),
    dados: snapshotPublico(orc, empresa),
    status: 'enviado',
  };

  const reusado = await tokenExistente(orc.id, user.id);
  let token = '';

  if (reusado) {
    // Token já existe para este orçamento: atualiza o snapshot (link não muda).
    token = reusado;
    const { error } = await supabase.from(TABLE).upsert({ token, ...baseRow }, { onConflict: 'token' });
    if (error) throw error;
  } else {
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
}

/**
 * Lê a linha do link de um orçamento com resiliência a schema: tenta o SELECT
 * completo (com `visualizado_em`); se a coluna ainda não existir na nuvem (erro
 * 42703 "column does not exist"), refaz o SELECT sem ela. Assim o app não quebra
 * antes de a migration 20260708_versoes.sql ser aplicada. NUNCA lança.
 */
async function lerLinkRow(orcamentoId: string, userId: string): Promise<LinkRow | null> {
  if (!supabase) return null;
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
    if (error && (error as any)?.code && (error as any).code !== '42703') return null;
  } catch {
    // cai para o fallback abaixo
  }
  // 2ª tentativa (fallback): sem visualizado_em (coluna ausente em banco antigo).
  try {
    const { data } = await supabase
      .from(TABLE)
      .select('status, respondido_em, resposta_cliente')
      .eq('orcamento_id', orcamentoId)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    return data ? normalizarLinkRow(data) : null;
  } catch {
    return null;
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
 * Retorna QUANTOS orçamentos mudaram de status. NUNCA lança: offline, deslogado,
 * sem nuvem ou qualquer erro de rede/backend resultam em 0 (no-op silencioso),
 * para poder ser chamada em background (ex.: ao focar a lista de orçamentos).
 */
export async function sincronizarStatusLinks(): Promise<number> {
  try {
    if (!supabase) return 0;
    const user = await getCurrentUser();
    if (!user) return 0;

    // Traz TODOS os links do dono (não só os respondidos) para também captar a
    // VISUALIZAÇÃO (mestre 13). Schema-resiliente: tenta com `visualizado_em`; se a
    // coluna ainda não existe (migration não aplicada), refaz sem ela.
    const rows = await lerLinksDoDono(user.id);
    if (!rows.length) return 0;

    let mudaram = 0;
    for (const row of rows) {
      try {
        if (!row.orcamentoId) continue;
        // Atalho barato: um link ainda em 'enviado' e SEM sinal de visualização/
        // resposta não tem nada a aplicar → evita o getOrcamento (leitura no SQLite).
        if (row.status === 'enviado' && !row.visualizadoEm) continue;

        const orc = await getOrcamento(row.orcamentoId);
        if (!orc) continue; // orçamento pode ter sido excluído localmente

        const alvo = statusLocalAlvo(orc.status, row);
        if (!alvo || alvo === orc.status) continue;

        // Espelha a evolução do cliente no orçamento local (saveOrcamento replica
        // para a nuvem/painel). Bump em atualizadoEm como no fluxo manual. Mudar
        // SÓ o status (mesmo conteúdo comercial) NÃO gera versão — a regra de ouro
        // do saveOrcamento compara a impressão comercial, imune à troca de status.
        await saveOrcamento({ ...orc, status: alvo, atualizadoEm: nowISO() });
        mudaram++;
      } catch {
        // pula linha problemática, segue o resto
      }
    }
    return mudaram;
  } catch {
    // nunca lança: qualquer falha vira 0 (offline/erro)
    return 0;
  }
}

/** Linha de link do dono, já normalizada, para o batch de sincronização. */
interface LinkDonoRow extends LinkRow {
  orcamentoId?: string;
}

/**
 * Lê em LOTE todos os links do dono com resiliência de schema (com/sem
 * `visualizado_em`). RLS já restringe ao dono; o `.eq('user_id')` é defensivo.
 * NUNCA lança: devolve [] em qualquer falha.
 */
async function lerLinksDoDono(userId: string): Promise<LinkDonoRow[]> {
  if (!supabase) return [];
  const mapear = (arr: any[]): LinkDonoRow[] =>
    arr.map((r) => ({ orcamentoId: r?.orcamento_id ?? undefined, ...normalizarLinkRow(r) }));
  // 1ª tentativa: com visualizado_em.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('orcamento_id, status, respondido_em, resposta_cliente, visualizado_em')
      .eq('user_id', userId);
    if (!error && Array.isArray(data)) return mapear(data);
    if (error && (error as any)?.code && (error as any).code !== '42703') return [];
  } catch {
    // cai para o fallback
  }
  // 2ª tentativa (fallback): sem visualizado_em.
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('orcamento_id, status, respondido_em, resposta_cliente')
      .eq('user_id', userId);
    if (error || !Array.isArray(data)) return [];
    return mapear(data);
  } catch {
    return [];
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
 * cronológica (mais antigo → mais recente). Se o orçamento nunca teve link ou a
 * nuvem está indisponível, devolve [] (a tela simplesmente não mostra a seção).
 * NUNCA lança. LGPD: o `motivo` é texto que o próprio cliente digitou; devolvido
 * só para exibição ao dono, jamais logado.
 */
export async function trilhaDoLink(orcamentoId: string): Promise<EventoTrilhaCliente[]> {
  try {
    const link = await statusDoLink(orcamentoId);
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
    return eventos;
  } catch {
    return [];
  }
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
 * dois aparelhos convergirem sem exibir "vN" duplicada. Fire-and-forget:
 * offline/deslogado/sem-nuvem = no-op silencioso. NUNCA lança.
 *
 * P1-4: membro não-dono (técnico) precisa gravar a versão no tenant do DONO —
 * senão o snapshot nasce com user_id dele (default da coluna) e o dono nunca o vê.
 * Mesmo padrão do cloudSync (`contextoEquipeOwner`): resolve a org via
 * `getMinhaOrganizacao()` e só inclui `user_id` no payload quando o usuário é
 * membro não-dono — a RLS de INSERT de `orcamento_versoes` já aceita
 * `user_id in donos_visiveis()` (20260708_versoes.sql), só faltava o app mandar.
 */
export async function espelharVersaoNuvem(versao: OrcamentoVersao): Promise<void> {
  try {
    if (!supabase || !versao?.id) return;
    const user = await getCurrentUser();
    if (!user) return;

    // Import dinâmico (mesmo motivo do cloudSync): evita aresta estática entre
    // clienteLink e equipe. getMinhaOrganizacao() colapsa erro em null — aqui é
    // caminho de escrita best-effort (não decide permissão), então o pior caso de
    // falha é gravar no próprio tenant (comportamento de hoje), nunca vazamento.
    const ownerUserId = await (async () => {
      try {
        const { getMinhaOrganizacao } = await import('./equipe');
        const org = await getMinhaOrganizacao();
        return org && org.papel !== 'owner' ? org.ownerUserId : null;
      } catch {
        return null;
      }
    })();

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
    if (!error) return;

    // 23505 = unique_violation. Como o upsert é por `id`, uma colisão aqui só pode
    // ser na UNIQUE(orcamento_id, numero_versao) — esse número já foi usado por
    // OUTRO aparelho. Renumera para o próximo livre e re-tenta UMA vez.
    if ((error as any)?.code !== '23505') return;
    const novoNumero = await proximoNumeroVersao(versao.orcamentoId);
    if (novoNumero === versao.numeroVersao) return; // nada a renumerar
    const { error: erroRetry } = await supabase
      .from(TABLE_VERSOES)
      .upsert(payload(novoNumero), { onConflict: 'id' });
    if (erroRetry) return; // ainda colidiu (corrida rara) — desiste sem quebrar
    // Sucesso na nuvem com o novo número: alinha o SQLite local (mesmo `id`) para
    // não ficar uma "vN" divergente entre local e nuvem.
    await upsertVersaoLocalSilencioso({ ...versao, numeroVersao: novoNumero });
  } catch {
    // espelho em background: nunca afeta o app local
  }
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
