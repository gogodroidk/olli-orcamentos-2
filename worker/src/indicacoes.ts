/**
 * Tipos e helpers de Indicações - Spec Mínima CPO 07/10
 * Zero invenções: reaproveita credit_ledger, olli_attr, funil_exclusoes
 */

import { createClient } from '@supabase/supabase-js';

export type EstadoIndicacao = 
  | 'link_gerado' 
  | 'cadastrou' 
  | 'orcou' 
  | 'recompensado';

export interface Indicacao {
  id: string;
  codigo: string;
  indicador_id: string;
  indicado_id: string | null;
  estado: EstadoIndicacao;
  criado_em: string;
  cadastrou_em: string | null;
  orcou_em: string | null;
  recompensado_em: string | null;
}

export interface CriarIndicacaoInput {
  indicador_id: string;
}

export interface AtualizarIndicacaoInput {
  indicado_id?: string;
  estado?: EstadoIndicacao;
  cadastrou_em?: string;
  orcou_em?: string;
  recompensado_em?: string;
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Gera código curto único: "OLLI-" + 4 chars do userId + 3 chars aleatórios
 * Ex: "OLLI-JOA3K7"
 */
export function gerarCodigoIndicacao(userId: string): string {
  const base = userId.slice(0, 4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `OLLI-${base}${random}`;
}

/**
 * Cria indicação para um indicador (chamado quando abre o cartão "Indique colegas")
 * Idempotente: se já existe código para este indicador, retorna o existente
 */
export async function criarOuBuscarIndicacao(indicadorId: string): Promise<Indicacao> {
  // 1. Tentar buscar existente
  const { data: existente } = await supabase
    .from('indicacoes')
    .select('*')
    .eq('indicador_id', indicadorId)
    .maybeSingle();

  if (existente) return existente as Indicacao;

  // 2. Criar nova (com retry se colisão de código)
  let codigo: string;
  let tentativas = 0;
  const maxTentativas = 5;

  while (tentativas < maxTentativas) {
    codigo = gerarCodigoIndicacao(indicadorId);
    
    const { data, error } = await supabase
      .from('indicacoes')
      .insert({
        codigo,
        indicador_id: indicadorId,
        estado: 'link_gerado',
      })
      .select()
      .single();

    if (!error && data) return data as Indicacao;
    
    // Se erro de unique constraint no código, tentar novamente
    if (error?.code === '23505') {
      tentativas++;
      continue;
    }
    throw error;
  }
  throw new Error('Falha ao gerar código único após 5 tentativas');
}

/**
 * Busca indicação por código (usado no cadastro via ?ref=)
 */
export async function buscarIndicacaoPorCodigo(codigo: string): Promise<Indicacao | null> {
  const { data } = await supabase
    .from('indicacoes')
    .select('*')
    .eq('codigo', codigo.toUpperCase())
    .maybeSingle();
  
  return data as Indicacao | null;
}

/**
 * Atualiza estado da indicação (worker usa service_role)
 */
export async function atualizarIndicacao(id: string, input: AtualizarIndicacaoInput): Promise<Indicacao> {
  const updates: Record<string, unknown> = { ...input };
  const agora = new Date().toISOString();
  
  if (input.estado === 'cadastrou') updates.cadastrou_em = agora;
  if (input.estado === 'orcou') updates.orcou_em = agora;
  if (input.estado === 'recompensado') updates.recompensado_em = agora;

  const { data, error } = await supabase
    .from('indicacoes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Indicacao;
}

/**
 * Busca indicações de um indicador (para dashboard no painel)
 */
export async function buscarIndicacoesPorIndicador(indicadorId: string): Promise<Indicacao[]> {
  const { data } = await supabase
    .from('indicacoes')
    .select('*')
    .eq('indicador_id', indicadorId)
    .order('criado_em', { ascending: false });
  
  return (data as Indicacao[]) || [];
}

/**
 * Valida código de indicação no formato esperado
 */
export function validarCodigoFormato(codigo: string): boolean {
  return /^OLLI-[A-Z0-9]{4,8}$/.test(codigo.toUpperCase());
}