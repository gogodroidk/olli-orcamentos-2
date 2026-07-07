import { supabase, getCurrentUser } from './supabase';
import { LINK_BASE_URL } from '../config';
import { track, Eventos } from './analytics';
import { Orcamento, Empresa, StatusOrcamento } from '../types';
import { generateId } from '../utils/id';
import { getOrcamento, saveOrcamento } from '../database/database';
import { nowISO } from '../utils/date';

const TABLE = 'orcamentos_publicos';

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

/** Converte bytes em base64url (A–Z a–z 0–9 - _) sem padding `=`. */
function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa === 'function'
      ? btoa(bin)
      : // RN/Hermes pode não ter btoa: usa Buffer se existir.
        (globalThis as any)?.Buffer
        ? (globalThis as any).Buffer.from(bytes).toString('base64')
        : bin;
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

/** Lê o status atual da resposta do cliente (aprovado/recusado/enviado). */
export async function statusDoLink(orcamentoId: string): Promise<{ status: string; respondidoEm?: string } | null> {
  if (!supabase) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase
    .from(TABLE)
    .select('status, respondido_em')
    .eq('orcamento_id', orcamentoId)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { status: (data as any).status, respondidoEm: (data as any).respondido_em ?? undefined };
}

/**
 * Sincroniza no banco LOCAL a resposta do cliente (aprovado/recusado) dos
 * orçamentos enviados por link. Faz UMA consulta em lote na tabela
 * `orcamentos_publicos` (RLS já restringe ao dono logado — mesmo caminho de leitura
 * seguro que `statusDoLink` usa por linha) trazendo só os links já respondidos, e
 * atualiza o status do orçamento local quando ele diverge da nuvem.
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

    // Só os links que o cliente JÁ respondeu importam para atualizar o local.
    const { data, error } = await supabase
      .from(TABLE)
      .select('orcamento_id, status, respondido_em')
      .eq('user_id', user.id)
      .in('status', ['aprovado', 'recusado']);
    if (error || !Array.isArray(data) || data.length === 0) return 0;

    let mudaram = 0;
    for (const row of data) {
      try {
        const orcamentoId = (row as any)?.orcamento_id as string | undefined;
        const statusNuvem = (row as any)?.status as string | undefined;
        if (!orcamentoId) continue;
        // A resposta do cliente é a fonte da verdade; só tratamos os 2 terminais.
        const novoStatus: StatusOrcamento | null =
          statusNuvem === 'aprovado' ? 'aprovado' : statusNuvem === 'recusado' ? 'recusado' : null;
        if (!novoStatus) continue;

        const orc = await getOrcamento(orcamentoId);
        if (!orc) continue;               // orçamento pode ter sido excluído localmente
        if (orc.status === novoStatus) continue; // já reflete a resposta → nada a fazer
        // Só aplicamos a resposta do cliente sobre um orçamento AINDA no estado
        // pré-resposta ('enviado'). Se o dono já moveu o status manualmente depois
        // (cancelado, aguardando_assinatura, ou aprovado/recusado à mão), a decisão
        // local é a mais recente e vence — sem isto, esta rotina reverteria a
        // mudança manual de volta à resposta antiga a CADA foco, em loop eterno.
        if (orc.status !== 'enviado') continue;

        // Espelha a resposta do cliente no orçamento local (saveOrcamento já
        // replica para a nuvem/painel). Bump em atualizadoEm como no fluxo manual.
        await saveOrcamento({ ...orc, status: novoStatus, atualizadoEm: nowISO() });
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
