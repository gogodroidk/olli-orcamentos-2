import type { VerticalId } from './verticais';

/**
 * checklistVertical.ts — CHECKLIST pronto por ofício para a Ordem de Serviço.
 *
 * Parte da personalização por vertical (docs/SISTEMA_SUPERIOR.md): o técnico abre a
 * OS e, em vez de digitar tudo do zero, aplica o roteiro do próprio ofício com um
 * toque. É o "app feito pra mim" no dia a dia de campo. São só sugestões editáveis —
 * o técnico marca, remove e acrescenta o que quiser.
 *
 * Passos redigidos na ORDEM real do serviço, começando pela segurança quando o ofício
 * exige (desligar disjuntor, fechar registro). Nada de conformidade legal aqui — é
 * roteiro operacional, não laudo.
 */
const MODELOS_CHECKLIST: Record<VerticalId, string[]> = {
  refrigeracao: [
    'Desligar o equipamento da tomada',
    'Limpar os filtros da evaporadora',
    'Higienizar serpentina e bandeja',
    'Verificar dreno e vazamentos',
    'Medir a pressão do gás',
    'Testar o ciclo (liga/desliga e temperatura)',
  ],
  eletrica: [
    'Desligar o disjuntor do circuito',
    'Testar ausência de tensão',
    'Conferir o aperto dos terminais',
    'Verificar o aterramento',
    'Testar DR e disjuntores',
    'Religar e medir a tensão',
  ],
  hidraulica: [
    'Fechar o registro geral',
    'Localizar o vazamento',
    'Trocar ou vedar a conexão',
    'Testar a pressão da rede',
    'Verificar o escoamento',
    'Limpar a área e testar',
  ],
  pintura: [
    'Proteger piso e móveis',
    'Lixar e corrigir imperfeições',
    'Aplicar fundo/selador',
    'Primeira demão',
    'Segunda demão',
    'Remover proteções e revisar o acabamento',
  ],
  dedetizacao: [
    'Vistoriar focos e pontos críticos',
    'Isolar áreas e proteger alimentos',
    'Aplicar o produto conforme o alvo',
    'Registrar produto e lote utilizados',
    'Orientar o prazo de reentrada',
    'Agendar retorno e monitoramento',
  ],
  caixa_dagua: [
    'Fechar o registro de entrada e reservar água para o consumo',
    'Esvaziar o reservatório pela limpeza (não pela rede)',
    'Escovar paredes e fundo sem sabão ou detergente',
    'Retirar a sujeira e enxaguar',
    'Desinfetar com solução clorada e respeitar o tempo de contato',
    'Enxaguar, tampar bem e registrar lacre e data da próxima limpeza',
  ],
  piscina: [
    'Medir pH, cloro e alcalinidade',
    'Peneirar a superfície',
    'Escovar paredes e bordas',
    'Aspirar o fundo',
    'Limpar o pré-filtro e retrolavar o filtro',
    'Corrigir a química e registrar as leituras',
  ],
  extintores: [
    'Conferir acesso, sinalização e altura de fixação',
    'Verificar lacre, manômetro e mangueira',
    'Conferir validade da carga e do teste hidrostático',
    'Registrar o número do selo de cada extintor',
    'Recolher os que vão para recarga e deixar reserva',
    'Etiquetar a próxima manutenção',
  ],
  jardinagem: [
    'Roçar e capinar',
    'Podar arbustos e árvores',
    'Adubar e tratar pragas',
    'Revisar a irrigação',
    'Recolher e destinar os resíduos',
    'Revisar o resultado com o cliente',
  ],
  // Genérico não tem roteiro fixo — o botão de modelo some (o técnico digita à mão).
  geral: [],
};

/** Roteiro de checklist do ofício (vazio = sem modelo → botão some). Nunca lança. */
export function modeloChecklistVertical(vertical: VerticalId | undefined): string[] {
  if (!vertical) return [];
  return MODELOS_CHECKLIST[vertical] ?? [];
}
