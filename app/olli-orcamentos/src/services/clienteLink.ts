import { supabase, getCurrentUser } from './supabase';
import { LINK_BASE_URL } from '../config';
import { track, Eventos } from './analytics';
import { Orcamento, Empresa } from '../types';
import { generateId } from '../utils/id';

const TABLE = 'orcamentos_publicos';

/** O link do cliente exige nuvem configurada (login) + domínio do Worker. */
export function linkConfigurado(): boolean {
  return !!supabase && !!LINK_BASE_URL;
}

function novoToken(): string {
  return generateId().replace(/-/g, '').slice(0, 12);
}

function snapshotPublico(orc: Orcamento, empresa: Empresa | null) {
  return {
    numero: orc.numero,
    clienteNome: orc.clienteNome,
    valorTotal: orc.valorTotal,
    subtotal: orc.subtotal,
    desconto: orc.desconto ?? 0,
    dataEmissao: orc.dataEmissao ?? orc.criadoEm ?? '',
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

  const token = (await tokenExistente(orc.id, user.id)) ?? novoToken();
  const row = {
    token,
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
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'token' });
  if (error) throw error;

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
