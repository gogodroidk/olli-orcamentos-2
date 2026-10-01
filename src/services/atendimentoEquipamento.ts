/**
 * Serviço do CHECK-IN PELO QR — a ficha do equipamento e o "Iniciar atendimento".
 *
 * O técnico aponta a câmera para o QR colado na máquina (EscanearQr), o app abre o
 * equipamento e esta camada monta o histórico (OS, fotos, PMOC, último serviço,
 * garantia, próxima manutenção) a partir do SQLite local — funciona offline, no
 * porão, sem sinal. A regra é pura em `utils/historicoEquipamento.ts`; aqui só a
 * leitura e a escrita.
 *
 * Erro nunca vira vazio: `carregarHistoricoEquipamento` LANÇA se a leitura falhar
 * (a tela mostra "não consegui carregar o histórico", nunca "nenhum serviço").
 */
import {
  getOrdensServicoDoEquipamento,
  getOrdensGeradasDoEquipamento,
  getOrcamento,
  getCliente,
  getEmpresa,
} from '../database/database';
import { atualizarStatusOS, criarOSManual } from './ordemServico';
import { modeloChecklistVertical } from './checklistVertical';
import { verticaisEfetivos } from './verticalSegmento';
import { generateId } from '../utils/id';
import { checklistDoModelo } from '../utils/ordemServicoDoOrcamento';
import {
  hojeLocal,
  montarHistoricoEquipamento,
  osParaRetomar,
  type HistoricoEquipamento,
} from '../utils/historicoEquipamento';
import { CATEGORIAS_HVAC, type Equipamento, type OrdemServico } from '../types';

/** Nome curto e humano do equipamento (título da OS, mensagens). */
export function nomeDoEquipamento(eq: Pick<Equipamento, 'codigoInterno' | 'fabricante' | 'modelo' | 'categoria'>): string {
  const marcaModelo = [eq.fabricante, eq.modelo].filter(Boolean).join(' ');
  const categoria = eq.categoria ? CATEGORIAS_HVAC.find((c) => c.id === eq.categoria)?.label : undefined;
  return eq.codigoInterno || marcaModelo || categoria || 'Equipamento';
}

/**
 * Histórico do equipamento (OS diretas + visitas PMOC). Lança em falha de leitura
 * das OS/visitas. A garantia vem dos orçamentos das OS concluídas; se UM orçamento
 * não puder ser lido, só a garantia daquele fica de fora (o histórico continua).
 */
export async function carregarHistoricoEquipamento(eq: Equipamento): Promise<HistoricoEquipamento> {
  const [ordens, geradas] = await Promise.all([
    getOrdensServicoDoEquipamento(eq.id),
    getOrdensGeradasDoEquipamento(eq.id),
  ]);
  const idsOrcamento = [
    ...new Set(ordens.filter((o) => o.status === 'concluida' && o.orcamentoId).map((o) => o.orcamentoId as string)),
  ].slice(0, 10);
  const garantiaPorOrcamento: Record<string, string | undefined> = {};
  await Promise.all(
    idsOrcamento.map(async (id) => {
      try {
        const orc = await getOrcamento(id);
        garantiaPorOrcamento[id] = orc?.garantia;
      } catch {
        // sem este orçamento, sem a garantia dele — não derruba o histórico
      }
    }),
  );
  return montarHistoricoEquipamento({
    equipamentoId: eq.id,
    fotosEquipamento: eq.fotos ?? [],
    ordens,
    geradas,
    garantiaPorOrcamento,
    hoje: hojeLocal(),
  });
}

export interface TecnicoAtendimento {
  id: string;
  nome?: string;
}

export interface ResultadoAtendimento {
  ordem: OrdemServico;
  /** true = OS nova; false = retomou uma OS aberta do equipamento. */
  criada: boolean;
}

/**
 * "Iniciar atendimento": retoma a OS aberta do equipamento (em execução > pausada >
 * agendada mais cedo > aberta), pondo-a em execução; se não houver nenhuma, cria
 * uma OS nova LIGADA ao equipamento (cliente do equipamento, checklist do ofício,
 * já em execução). Quando quem escaneou é técnico de equipe, a OS nova sai
 * atribuída a ele — senão ela sumiria da lista "minhas OS" dele.
 */
export async function iniciarAtendimento(
  eq: Equipamento,
  historico: HistoricoEquipamento,
  tecnico?: TecnicoAtendimento,
): Promise<ResultadoAtendimento> {
  if (eq.excluidoEm) throw new Error('Este equipamento está na lixeira. Restaure-o antes de atender.');

  const aberta = osParaRetomar(historico.abertas);
  if (aberta) {
    if (aberta.status !== 'em_execucao') await atualizarStatusOS(aberta.id, 'em_execucao');
    return { ordem: { ...aberta, status: 'em_execucao' }, criada: false };
  }

  // Cliente do equipamento (nome é obrigatório na OS). Falha de leitura não
  // impede o atendimento: a OS sai sem cliente e o técnico ajusta na OS.
  let clienteNome = '';
  if (eq.clienteId) {
    try {
      clienteNome = (await getCliente(eq.clienteId))?.nome ?? '';
    } catch {
      clienteNome = '';
    }
  }
  const vertical = await getEmpresa()
    .then((emp) => verticaisEfetivos(emp)?.[0])
    .catch(() => undefined);
  const nome = nomeDoEquipamento(eq);
  const categoria = eq.categoria ? CATEGORIAS_HVAC.find((c) => c.id === eq.categoria)?.label : undefined;
  const descricao = [
    `Atendimento iniciado pelo QR do equipamento ${nome}.`,
    [categoria, eq.fabricante, eq.modelo].filter(Boolean).join(' · '),
    eq.localizacao ? `Local: ${eq.localizacao}` : '',
  ].filter(Boolean).join('\n');

  const ordem = await criarOSManual({
    clienteId: eq.clienteId,
    clienteNome,
    titulo: `Atendimento · ${nome}`,
    descricao,
    status: 'em_execucao',
    equipamentoId: eq.id,
    checklist: checklistDoModelo(modeloChecklistVertical(vertical), generateId),
    ...(tecnico?.id ? { tecnicoId: tecnico.id, tecnicoNome: tecnico.nome } : {}),
  });
  return { ordem, criada: true };
}
