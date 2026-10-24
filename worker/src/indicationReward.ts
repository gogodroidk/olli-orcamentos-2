/**
 * Processamento de Recompensa de Indicação - Spec Mínima CPO 07/10
 * Gatilho: orcamento_criado (webhook/user_activity_log)
 * Recompensa: créditos IA (X definido por Igor lendo creditos.ts)
 * Double-sided: indicador + indicado ganham
 * Tetos: 5 recompensas/indicador, 1/indicado
 * Anti-fraude: indicador ≠ indicado, valor > 0, fora funil_exclusoes
 */

import { createClient } from '@supabase/supabase-js';
import { creditarIA } from './creditos.ts';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OrcamentoCriadoEvento {
  orcamento_id: string;
  user_id: string;        // quem criou o orçamento (indicado)
  cliente_id: string;
  valor_total: number;
  criado_em: string;
}

/**
 * Verifica se usuário está em funil_exclusoes (conta interna/demo)
 */
async function estaEmFunilExclusoes(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('funil_exclusoes')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  
  return !!data;
}

/**
 * Conta recompensas de indicação já creditadas para um indicador
 */
async function contarRecompensasIndicador(indicadorId: string): Promise<number> {
  const { count } = await supabase
    .from('credit_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', indicadorId)
    .eq('origem', 'referral');
  
  return count || 0;
}

/**
 * Decide quantidade de créditos IA (X) - Igor define lendo creditos.ts
 * Por enquanto retorna valor padrão; Igor ajusta conforme pesos do ledger
 */
async function decidirCreditosIA(): Promise<number> {
  // TODO: Igor define lendo creditos.ts (pesos de cada ação)
  // Sugestão inicial: 10 créditos IA = ~3 diagnósticos por voz
  return 10;
}

/**
 * Processa recompensa de indicação no 1º orçamento do indicado
 * Chamado pelo worker no webhook orcamento_criado
 */
export async function processarRecompensaIndicacao(evento: OrcamentoCriadoEvento): Promise<{
  processado: boolean;
  motivo?: string;
  indicacao_id?: string;
  creditos?: number;
}> {
  const { user_id: indicadoId, valor_total, orcamento_id } = evento;

  // 1. Validações básicas do orçamento
  if (valor_total <= 0) {
    return { processado: false, motivo: 'valor_zero_ou_negativo' };
  }

  // 2. Buscar indicação onde indicado_id = userId E estado = 'cadastrou'
  const { data: indicacao } = await supabase
    .from('indicacoes')
    .select('*')
    .eq('indicado_id', indicadoId)
    .eq('estado', 'cadastrou')
    .maybeSingle();

  if (!indicacao) {
    return { processado: false, motivo: 'nao_veio_por_indicacao_ou_ja_processado' };
  }

  const indicadorId = indicacao.indicador_id;

  // 3. Anti-fraude: auto-indicação
  if (indicadorId === indicadoId) {
    return { processado: false, motivo: 'auto_indicacao' };
  }

  // 4. Anti-fraude: indicador em funil_exclusoes (conta interna/demo)
  if (await estaEmFunilExclusoes(indicadorId)) {
    return { processado: false, motivo: 'indicador_em_funil_exclusoes' };
  }

  // 5. Teto: máximo 5 recompensas por indicador
  const recompensasJaCreditadas = await contarRecompensasIndicador(indicadorId);
  if (recompensasJaCreditadas >= 5) {
    return { processado: false, motivo: 'teto_indicador_atingido' };
  }

  // 6. Decidir créditos IA
  const creditos = await decidirCreditosIA();
  const ref = indicacao.id; // UUID da indicação = ref único para idempotência

  // 7. Creditar AMBOS (double-sided) - idempotência por (origem, ref) já existe em creditos.ts
  await Promise.all([
    creditarIA(indicadorId, creditos, 'referral', ref),
    creditarIA(indicadoId, creditos, 'referral', ref),
  ]);

  // 8. Atualizar estado da indicação
  await supabase
    .from('indicacoes')
    .update({
      estado: 'recompensado',
      orcou_em: evento.criado_em,
      recompensado_em: new Date().toISOString(),
    })
    .eq('id', indicacao.id);

  // 9. Registrar eventos (para medição)
  await Promise.all([
    registrarEvento('indicado_primeiro_orcamento', {
      indicacao_id: indicacao.id,
      indicador_id: indicadorId,
      indicado_id: indicadoId,
      orcamento_id,
      valor_total,
    }),
    registrarEvento('recompensa_creditada', {
      indicacao_id: indicacao.id,
      creditos,
      indicador_id,
      indicado_id,
    }),
  ]);

  return { 
    processado: true, 
    indicacao_id: indicacao.id, 
    creditos 
  };
}

/**
 * Registra evento no auth_funil_eventos (tabela existente)
 */
async function registrarEvento(evento: string, props: Record<string, unknown>): Promise<void> {
  await supabase
    .from('auth_funil_eventos')
    .insert({
      evento,
      motivo: JSON.stringify(props),
      criado_em: new Date().toISOString(),
    });
}