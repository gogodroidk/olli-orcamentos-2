/**
 * Serviço de ORDENS DE SERVIÇO (Onda 4) — a ÚNICA superfície de API do contrato
 * entre a fundação (frente A) e o app do técnico (frente B), além dos types.
 *
 * Local-first: toda leitura/escrita passa pelo SQLite (database.ts), que já espelha
 * na nuvem (public.ordens_servico) em background. Aqui vive só a REGRA de negócio:
 * numeração sequencial (OS-0001), geração de OS a partir de um orçamento aprovado,
 * criação manual e as mutações pontuais (status/técnico/checklist/foto).
 *
 * Nenhuma coluna fora do CONTRATO é inventada. Ids via generateId() (UUID estável
 * entre aparelhos). Todas as escritas atualizam `atualizadoEm`.
 */
import {
  getDb,
  getOrdensServico,
  getOrdemServico as getOrdemServicoDb,
  saveOrdemServico,
  getOrcamento,
  getEmpresa,
} from '../database/database';
import { cancelarLembretesPmoc } from './pmocLembretes';
import { supabase } from './supabase';
import { modeloChecklistVertical } from './checklistVertical';
import { verticaisEfetivos } from './verticalSegmento';
import { generateId } from '../utils/id';
import { concluidoEmDaTransicao } from '../utils/ordemServicoStatus';
import { montarOSDoOrcamento, proximoNumeroOSDasFontes } from '../utils/ordemServicoDoOrcamento';
import type { OrdemServico, StatusOS, ItemChecklist } from '../types';

/** Todas as OS visíveis (o SELECT local já reflete o tenant/org via sync). */
export async function getOrdens(): Promise<OrdemServico[]> {
  return getOrdensServico();
}

/** OS atribuídas a um técnico específico (filtro por tecnicoId). */
export async function getMinhasOrdens(tecnicoId: string): Promise<OrdemServico[]> {
  if (!tecnicoId) return [];
  const todas = await getOrdensServico();
  return todas.filter((os) => os.tecnicoId === tecnicoId);
}

/** Uma OS por id, ou null. */
export async function getOrdem(id: string): Promise<OrdemServico | null> {
  return getOrdemServicoDb(id);
}

/** Teto de espera pela nuvem ao numerar: offline não pode travar a criação da OS. */
const TIMEOUT_NUMERACAO_NUVEM_MS = 4000;

/**
 * Números de OS no SQLite local — TODAS as linhas, inclusive a lixeira (soft delete só
 * marca `excluido_em`; o número continua reservado: se olhássemos só as ativas, a OS
 * de maior número poderia estar na lixeira e ter o número reemitido, colidindo com
 * ela mesma ao ser restaurada). `null` = não consegui ler (≠ `[]`, "não tem nenhuma").
 */
async function numerosOSLocais(): Promise<string[] | null> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<{ numero: string | null }>('SELECT numero FROM ordens_servico');
    return rows.map((r) => r.numero ?? '');
  } catch {
    return null;
  }
}

/**
 * Números de OS na NUVEM que este usuário enxerga (a RLS recorta o tenant). É o que
 * fecha a colisão com as OS que nasceram fora deste aparelho e ainda não desceram no
 * sync: as do painel web, as do motor de contratos (servidor) e as de outro membro.
 * Mesma consulta do motor de contratos (`proximoSequencialOs`), lixeira incluída.
 * Best-effort com teto de tempo: sem rede, `null`, e vale o que o aparelho sabe.
 */
async function numerosOSNaNuvem(): Promise<string[] | null> {
  if (!supabase) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const consulta = supabase
      .from('ordens_servico')
      .select('numero')
      .order('criado_em', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) return null;
        return (data as { numero?: string | null }[]).map((l) => l.numero ?? '');
      });
    const limite = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), TIMEOUT_NUMERACAO_NUVEM_MS);
    });
    return await Promise.race([consulta, limite]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Próximo número de OS (OS-0001), sequencial e sem colisão: MAIOR número entre o
 * SQLite local e a nuvem + 1. Só o local não bastava — a OS criada pelo painel, pelo
 * motor de contratos ou por outro aparelho ainda não baixada tinha o número reemitido.
 *
 * Se NENHUMA das duas fontes puder ser lida, lança em vez de chutar OS-0001 (erro
 * nunca vira vazio). Offline com o banco local ok segue funcionando como antes.
 *
 * O que isto não resolve sozinho: dois aparelhos OFFLINE criando ao mesmo tempo. Não
 * há UNIQUE em `numero` na nuvem; quando houver, o handler de 23505 do sync renumera
 * (o mesmo caminho dos orçamentos).
 */
async function proximoNumeroOS(): Promise<string> {
  const [locais, nuvem] = await Promise.all([numerosOSLocais(), numerosOSNaNuvem()]);
  const numero = proximoNumeroOSDasFontes(locais, nuvem);
  if (!numero) {
    throw new Error('Não consegui conferir a numeração das ordens de serviço. Tente de novo em instantes.');
  }
  return numero;
}

/**
 * Cria uma OS a partir de um orçamento APROVADO, já pronta para o técnico: cliente,
 * título, valor, os ITENS e o ENDEREÇO do serviço (na descrição), a data do
 * agendamento do serviço (ou da prestação), o checklist do ofício da empresa e as
 * fotos do orçamento (regra em `utils/ordemServicoDoOrcamento.ts`). Status inicial
 * 'aberta'. Lança se o orçamento não existir ou já tiver OS (o chamador trata a
 * mensagem).
 */
export async function criarOSDeOrcamento(orcamentoId: string): Promise<OrdemServico> {
  const orc = await getOrcamento(orcamentoId);
  if (!orc) {
    throw new Error('Orçamento não encontrado para gerar a OS.');
  }
  // Dedupe: um orçamento gera no máximo UMA ordem de serviço. Se já existe uma OS
  // com este orcamentoId, aborta com mensagem clara em vez de duplicar.
  const jaExiste = (await getOrdensServico()).some((os) => os.orcamentoId === orcamentoId);
  if (jaExiste) {
    throw new Error('Já existe uma ordem de serviço para este orçamento.');
  }
  // Ofício da empresa → roteiro de checklist (vazio para 'geral'/sem ofício). Lê o
  // cadastro direto (mesma regra do `useVerticais`, sem importar o hook: ele puxa
  // AppState, que o painel não tem). Falha de leitura = sem roteiro, não erro.
  const vertical = await getEmpresa()
    .then((emp) => verticaisEfetivos(emp)?.[0])
    .catch(() => undefined);
  const os = montarOSDoOrcamento(orc, {
    id: generateId(),
    numero: await proximoNumeroOS(),
    agora: new Date().toISOString(),
    modeloChecklist: modeloChecklistVertical(vertical),
    novoId: generateId,
  });
  await saveOrdemServico(os);
  return os;
}

/**
 * Cria uma OS avulsa (sem orçamento de origem) a partir de um parcial. Preenche os
 * obrigatórios com defaults sãos (número sequencial, status 'aberta', listas vazias)
 * quando não vierem. Nunca sobrescreve id/datas fornecidos explicitamente.
 */
export async function criarOSManual(parcial: Partial<OrdemServico>): Promise<OrdemServico> {
  const agora = new Date().toISOString();
  const os: OrdemServico = {
    id: parcial.id ?? generateId(),
    numero: parcial.numero ?? (await proximoNumeroOS()),
    orcamentoId: parcial.orcamentoId,
    clienteId: parcial.clienteId,
    clienteNome: parcial.clienteNome ?? '',
    titulo: parcial.titulo ?? 'Ordem de serviço',
    descricao: parcial.descricao,
    status: parcial.status ?? 'aberta',
    concluidoEm: parcial.status === 'concluida' ? concluidoEmDaTransicao(undefined, 'concluida', agora) : undefined,
    tecnicoId: parcial.tecnicoId,
    tecnicoNome: parcial.tecnicoNome,
    dataAgendada: parcial.dataAgendada,
    checklist: Array.isArray(parcial.checklist) ? parcial.checklist : [],
    fotos: Array.isArray(parcial.fotos) ? parcial.fotos : [],
    observacoes: parcial.observacoes,
    valor: parcial.valor,
    equipamentoId: parcial.equipamentoId,
    ...(parcial.garantia?.trim() ? { garantia: parcial.garantia.trim().slice(0, 200) } : {}),
    ...(parcial.garantiaDeOsId ? { garantiaDeOsId: parcial.garantiaDeOsId } : {}),
    criadoEm: parcial.criadoEm ?? agora,
    atualizadoEm: agora,
  };
  await saveOrdemServico(os);
  return os;
}

/**
 * Carrega a OS, aplica um patch e persiste — helper interno das mutações pontuais.
 * Lança se a OS não existir. Sempre atualiza `atualizadoEm`.
 */
async function patchOrdem(id: string, patch: Partial<OrdemServico>): Promise<OrdemServico> {
  const atual = await getOrdemServicoDb(id);
  if (!atual) {
    throw new Error('Ordem de serviço não encontrada.');
  }
  const atualizada: OrdemServico = {
    ...atual,
    ...patch,
    id: atual.id,
    // O marco é derivado da transição; nunca aceitamos que uma edição de
    // formulário injete um timestamp ou preserve um marco depois de reabrir.
    concluidoEm: concluidoEmDaTransicao(atual, patch.status ?? atual.status, new Date().toISOString()),
    atualizadoEm: new Date().toISOString(),
  };
  await saveOrdemServico(atualizada);
  return atualizada;
}

/**
 * Muda o status da OS (aberta → agendada → em_execucao → …). Ao chegar num
 * status TERMINAL (concluída/cancelada), cancela o lembrete de vencimento PMOC
 * desta OS, se houver — visita concluída/cancelada não deve mais avisar que
 * está vencendo. `cancelarLembretesPmoc` é no-op silencioso para OS que nunca
 * teve lembrete (a maioria, que não nasceu de um plano PMOC), então o gancho
 * fica aqui sem precisar saber a origem da OS. Fire-and-forget: notificação
 * nunca pode travar a mudança de status.
 */
export async function atualizarStatusOS(id: string, status: StatusOS): Promise<void> {
  // Garantia que se cuida sozinha (I3): ao concluir uma OS que ainda não tem prazo
  // próprio, ela herda o prazo escrito no orçamento de origem — é o que leva o
  // "vale até" para a nuvem (garantia_ate) e para a etiqueta QR. Falha de leitura
  // do orçamento não impede a conclusão.
  const patch: Partial<OrdemServico> = { status };
  if (status === 'concluida') {
    try {
      const atual = await getOrdemServicoDb(id);
      if (atual && !atual.garantia?.trim() && atual.orcamentoId) {
        const garantiaOrc = (await getOrcamento(atual.orcamentoId))?.garantia?.trim();
        if (garantiaOrc) patch.garantia = garantiaOrc.slice(0, 200);
      }
    } catch {
      // segue sem herdar: a garantia do orçamento continua valendo na leitura local
    }
  }
  const atualizada = await patchOrdem(id, patch);
  if (status === 'concluida') {
    // Registro documental é best-effort: a conclusão da OS não pode falhar por
    // uma indisponibilidade transitória da biblioteca local.
    void import('./documentosBiblioteca').then(({ garantirDocumentoOrdemServico }) =>
      garantirDocumentoOrdemServico(atualizada).catch(() => {}),
    ).catch(() => {});
  }
  if (status === 'concluida' || status === 'cancelada') {
    void cancelarLembretesPmoc(id).catch(() => {});
  }
}

/**
 * Define (ou limpa, com texto vazio) o prazo de garantia DESTA OS ("90 dias").
 * Vazio = a OS deixa de declarar garantia própria (vale a do orçamento, se houver).
 */
export async function definirGarantiaOS(id: string, texto: string): Promise<OrdemServico> {
  const limpo = texto.trim().slice(0, 200);
  return patchOrdem(id, { garantia: limpo || undefined });
}

/** Atribui (ou reatribui) o técnico executor da OS. */
export async function atribuirTecnico(id: string, tecnicoId: string, tecnicoNome: string): Promise<void> {
  await patchOrdem(id, { tecnicoId, tecnicoNome });
}

/** Substitui o checklist inteiro da OS (o app envia a lista completa já mutada). */
export async function atualizarChecklist(id: string, checklist: ItemChecklist[]): Promise<void> {
  await patchOrdem(id, { checklist: Array.isArray(checklist) ? checklist : [] });
}

/** Anexa uma foto (uri) à OS, preservando as existentes e sem duplicar. */
export async function adicionarFotoOS(id: string, uri: string): Promise<void> {
  if (!uri) return;
  const atual = await getOrdemServicoDb(id);
  if (!atual) {
    throw new Error('Ordem de serviço não encontrada.');
  }
  const fotos = Array.isArray(atual.fotos) ? atual.fotos : [];
  if (fotos.includes(uri)) return; // idempotente: já anexada
  await patchOrdem(id, { fotos: [...fotos, uri] });
}
