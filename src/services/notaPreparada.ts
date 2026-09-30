/**
 * "OLLI prepara a nota" — a parte que fala com a nuvem, no app (mobile e desktop).
 *
 * Os dados da nota são montados LOCALMENTE (utils/notaServico.ts) a partir do recibo,
 * do cliente e da empresa do aparelho: copiar os campos funciona até sem internet.
 * O que depende da nuvem é GUARDAR (tabela `notas_preparadas`, migration
 * 20260930130700) e o interesse na nota automática. Cada leitura devolve um estado
 * honesto, nunca um "não tem" quando o certo é "não sei":
 *   • desligado — sem nuvem configurada, sem sessão ou sem a migration aplicada;
 *   • erro      — a leitura falhou (a tela oferece "tentar de novo");
 *   • valor     — a resposta confirmada (inclusive "ainda não guardada" = null).
 */
import { supabase } from './supabase';
import {
  erroRecursoDesligado,
  interpretarNotaSalva,
  validarNumeroNota,
  type DadosNota,
  type NotaSalva,
  type OrigemInteresseNota,
} from '../utils/notaServico';

export type MotivoDesligado = 'sem_nuvem' | 'sem_sessao' | 'sem_tabela';

export type LeituraNota =
  | { tipo: 'desligado'; motivo: MotivoDesligado }
  | { tipo: 'erro' }
  | { tipo: 'valor'; nota: NotaSalva | null };

export type LeituraInteresse =
  | { tipo: 'desligado'; motivo: MotivoDesligado }
  | { tipo: 'erro' }
  | { tipo: 'valor'; registrado: boolean };

/** Resultado de uma gravação: a nota confirmada pelo banco, ou o motivo de não ter gravado. */
export type GravacaoNota =
  | { ok: true; nota: NotaSalva }
  | { ok: false; motivo: 'desligado' | 'erro' | 'numero_invalido' };

const COLUNAS = 'id, status, numero_nota, emitida_em, atualizado_em, dados';

async function temSessao(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function lerNotaDoRecibo(reciboId: string): Promise<LeituraNota> {
  if (!supabase) return { tipo: 'desligado', motivo: 'sem_nuvem' };
  try {
    if (!(await temSessao())) return { tipo: 'desligado', motivo: 'sem_sessao' };
    const { data, error } = await supabase.from('notas_preparadas').select(COLUNAS).eq('recibo_id', reciboId).maybeSingle();
    if (error) return erroRecursoDesligado(error) ? { tipo: 'desligado', motivo: 'sem_tabela' } : { tipo: 'erro' };
    if (data === null) return { tipo: 'valor', nota: null };
    const nota = interpretarNotaSalva(data);
    return nota ? { tipo: 'valor', nota } : { tipo: 'erro' };
  } catch {
    return { tipo: 'erro' };
  }
}

function resultado(data: unknown, error: { code?: string; message?: string } | null): GravacaoNota {
  if (error) return { ok: false, motivo: erroRecursoDesligado(error) ? 'desligado' : 'erro' };
  const nota = interpretarNotaSalva(data);
  return nota ? { ok: true, nota } : { ok: false, motivo: 'erro' };
}

/** Guarda (ou atualiza) os dados preparados. Uma nota por recibo; o dono é o `auth.uid()`. */
export async function guardarNotaPreparada(dados: DadosNota): Promise<GravacaoNota> {
  if (!supabase) return { ok: false, motivo: 'desligado' };
  try {
    const { data, error } = await supabase
      .from('notas_preparadas')
      .upsert({ recibo_id: dados.reciboId, dados }, { onConflict: 'user_id,recibo_id' })
      .select(COLUNAS)
      .single();
    return resultado(data, error);
  } catch {
    return { ok: false, motivo: 'erro' };
  }
}

/** O prestador informa que emitiu no portal, com o número que o portal deu. */
export async function marcarNotaEmitida(notaId: string, numeroDigitado: string): Promise<GravacaoNota> {
  const numero = validarNumeroNota(numeroDigitado);
  if (!numero) return { ok: false, motivo: 'numero_invalido' };
  if (!supabase) return { ok: false, motivo: 'desligado' };
  try {
    const { data, error } = await supabase
      .from('notas_preparadas')
      .update({ status: 'emitida', numero_nota: numero, emitida_em: new Date().toISOString() })
      .eq('id', notaId)
      .select(COLUNAS)
      .single();
    return resultado(data, error);
  } catch {
    return { ok: false, motivo: 'erro' };
  }
}

/** Desfaz o "emitida" (número digitado errado, ou a emissão não se concretizou). */
export async function voltarNotaParaPreparada(notaId: string): Promise<GravacaoNota> {
  if (!supabase) return { ok: false, motivo: 'desligado' };
  try {
    const { data, error } = await supabase
      .from('notas_preparadas')
      .update({ status: 'preparada', numero_nota: null, emitida_em: null })
      .eq('id', notaId)
      .select(COLUNAS)
      .single();
    return resultado(data, error);
  } catch {
    return { ok: false, motivo: 'erro' };
  }
}

export async function lerInteresseNotaAutomatica(): Promise<LeituraInteresse> {
  if (!supabase) return { tipo: 'desligado', motivo: 'sem_nuvem' };
  try {
    if (!(await temSessao())) return { tipo: 'desligado', motivo: 'sem_sessao' };
    const { data, error } = await supabase.from('nota_automatica_interesse').select('user_id').maybeSingle();
    if (error) return erroRecursoDesligado(error) ? { tipo: 'desligado', motivo: 'sem_tabela' } : { tipo: 'erro' };
    return { tipo: 'valor', registrado: data !== null };
  } catch {
    return { tipo: 'erro' };
  }
}

/** Registra o interesse. Já registrado (23505) conta como sucesso: é o mesmo pedido. */
export async function registrarInteresseNotaAutomatica(origem: OrigemInteresseNota): Promise<'ok' | 'desligado' | 'erro'> {
  if (!supabase) return 'desligado';
  try {
    const { error } = await supabase.from('nota_automatica_interesse').insert({ origem });
    if (!error || error.code === '23505') return 'ok';
    return erroRecursoDesligado(error) ? 'desligado' : 'erro';
  } catch {
    return 'erro';
  }
}

/** O que a tela diz quando guardar está desligado. */
export function textoDesligado(motivo: MotivoDesligado): string {
  if (motivo === 'sem_nuvem') return 'Guardar a nota precisa da conta na nuvem, que não está configurada neste aparelho. Os campos para copiar funcionam normalmente.';
  if (motivo === 'sem_sessao') return 'Entre na sua conta para guardar a nota preparada. Os campos para copiar funcionam normalmente.';
  return 'Guardar a nota preparada ainda está desligado no servidor. Os campos para copiar funcionam normalmente.';
}
