/**
 * Integração Indicação no Signup - Worker
 * Chamado no authEmailHook.js / auth_funil_eventos no evento signup_completed
 * Lê olli_attr do cookie/header → atualiza indicação → credita se já tem orçamento (raro)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Extrai código de indicação do header/cookie da request
 */
export function extrairRefDaRequest(req: Request): string | null {
  // 1. Tentar header customizado (app móvel envia)
  const headerRef = req.headers.get('x-olli-ref');
  if (headerRef?.startsWith('ref:')) return headerRef.substring(4);
  if (headerRef && /^OLLI-[A-Z0-9]{4,8}$/.test(headerRef.toUpperCase())) return headerRef.toUpperCase();

  // 2. Tentar cookie
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [nome, valor] = cookie.trim().split('=');
      if (nome === 'olli_attr' && valor?.startsWith('ref:')) {
        return valor.substring(4);
      }
    }
  }

  return null;
}

/**
 * Processa indicação no signup do usuário
 * Retorna { indicacaoId, indicadorId } se processado, null se não
 */
export async function processarIndicacaoNoSignup(
  userId: string,
  ref: string | null
): Promise<{ indicacaoId: string; indicadorId: string } | null> {
  if (!ref) return null;

  const codigo = ref.toUpperCase().trim();
  if (!/^OLLI-[A-Z0-9]{4,8}$/.test(codigo)) return null;

  // Buscar indicação pelo código
  const { data: indicacao, error } = await supabase
    .from('indicacoes')
    .select('*')
    .eq('codigo', codigo)
    .eq('estado', 'link_gerado')
    .maybeSingle();

  if (error || !indicacao) {
    console.warn('Indicação não encontrada ou inválida:', codigo);
    return null;
  }

  // Anti-fraude: não pode ser o próprio indicador
  if (indicacao.indicador_id === userId) {
    console.warn('Auto-indicação bloqueada:', userId);
    return null;
  }

  // Atualizar indicação: vincular indicado
  const { error: updateError } = await supabase
    .from('indicacoes')
    .update({
      indicado_id: userId,
      estado: 'cadastrou',
      cadastrou_em: new Date().toISOString(),
    })
    .eq('id', indicacao.id);

  if (updateError) {
    console.error('Erro ao atualizar indicação:', updateError);
    return null;
  }

  // Registrar evento
  await supabase
    .from('auth_funil_eventos')
    .insert({
      evento: 'cadastro_por_indicacao',
      motivo: JSON.stringify({
        indicacao_id: indicacao.id,
        indicador_id: indicacao.indicador_id,
        indicado_id: userId,
        codigo,
      }),
      criado_em: new Date().toISOString(),
    });

  return {
    indicacaoId: indicacao.id,
    indicadorId: indicacao.indicador_id,
  };
}

/**
 * Verifica se indicado já tem orçamento (para creditar imediatamente se já fez)
 * Raro: usuário cadastra via indicação e JÁ tem orçamento (dados migrados, etc)
 */
export async function verificarECreditarSeJaOrcou(indicadoId: string): Promise<boolean> {
  const { data: indicacao } = await supabase
    .from('indicacoes')
    .select('*')
    .eq('indicado_id', indicadoId)
    .eq('estado', 'cadastrou')
    .maybeSingle();

  if (!indicacao) return false;

  // Verificar se já tem orçamento
  const { data: orcamento } = await supabase
    .from('orcamentos')
    .select('id, valor_total, criado_em')
    .eq('user_id', indicadoId)
    .gt('valor_total', 0)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!orcamento) return false;

  // Processar recompensa (reaproveita indicationReward.ts)
  const { processarRecompensaIndicacao } = await import('./indicationReward.ts');
  
  const resultado = await processarRecompensaIndicacao({
    orcamento_id: orcamento.id,
    user_id: indicadoId,
    cliente_id: '', // seria preenchido se necessário
    valor_total: orcamento.valor_total,
    criado_em: orcamento.criado_em,
  });

  return resultado.processado;
}