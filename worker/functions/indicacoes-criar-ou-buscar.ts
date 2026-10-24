/**
 * Edge Function: indicacoes-criar-ou-buscar
 * Chamado pelo app/painel quando usuário abre cartão "Indique colegas"
 * Retorna código de indicação (cria se não existe)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function gerarCodigoIndicacao(userId: string): string {
  const base = userId.slice(0, 4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `OLLI-${base}${random}`;
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { indicador_id } = await req.json();
    
    if (!indicador_id || typeof indicador_id !== 'string') {
      return new Response(JSON.stringify({ error: 'indicador_id obrigatório' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Tentar buscar indicação existente
    const { data: existente, error: erroBusca } = await supabase
      .from('indicacoes')
      .select('codigo')
      .eq('indicador_id', indicador_id)
      .maybeSingle();

    if (erroBusca) throw erroBusca;

    if (existente?.codigo) {
      return new Response(JSON.stringify({ codigo: existente.codigo }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Criar nova (com retry se colisão de código)
    let codigo: string;
    let tentativas = 0;
    const maxTentativas = 5;

    while (tentativas < maxTentativas) {
      codigo = gerarCodigoIndicacao(indicador_id);
      
      const { data, error } = await supabase
        .from('indicacoes')
        .insert({
          codigo,
          indicador_id,
          estado: 'link_gerado',
        })
        .select('codigo')
        .single();

      if (!error && data) {
        return new Response(JSON.stringify({ codigo: data.codigo }), { 
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (error?.code === '23505') {
        tentativas++;
        continue;
      }
      throw error;
    }

    throw new Error('Falha ao gerar código único após 5 tentativas');

  } catch (error) {
    console.error('Erro indicacoes-criar-ou-buscar:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});